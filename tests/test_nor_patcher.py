"""Testes da conversao de chip HDMI (nor_patcher).

Rodar na pasta do projeto:  python -m unittest discover -s tests -v

Os testes com NORs reais so rodam se os arquivos existirem na maquina (nunca
vao pro repositorio -- tem MAC e serie de clientes); os sinteticos sempre rodam.
"""
import pathlib
import random
import struct
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from nor_parser import EXPECTED_SIZE, OFFSET_CHIP_SELECT  # noqa: E402
from nor_patcher import (  # noqa: E402
    OFFSET_CHECKSUM,
    OFFSET_CHECKSUM_BLOCK,
    TARGET_NUVOTON,
    TARGET_PANASONIC,
    TARGET_REALTEK,
    apply_patch,
    compute_checksum,
)

REAL_DIR = pathlib.Path(__file__).parent.parent.parent / "tgt"  # leitura + saidas do Conversor HDMI PS5


def word_sum(data: bytes) -> int:
    return sum(struct.unpack_from("<H", data, i)[0]
               for i in range(OFFSET_CHECKSUM_BLOCK, OFFSET_CHECKSUM + 2, 2)) & 0xFFFF


def synthetic_nor(seed: int = 1) -> bytes:
    """NOR sintetica de 2 MB, chip Realtek, com bloco de pareamento preenchido."""
    rnd = random.Random(seed)
    buf = bytearray(rnd.randbytes(EXPECTED_SIZE))
    buf[OFFSET_CHIP_SELECT] = 0x01
    buf[OFFSET_CHECKSUM:OFFSET_CHECKSUM + 2] = compute_checksum(buf)
    return bytes(buf)


class ChecksumTest(unittest.TestCase):
    def test_soma_do_bloco_fecha_em_zero(self):
        buf = synthetic_nor(7)
        self.assertEqual(word_sum(buf), 0)

    def test_checksum_depende_so_do_bloco_0x1C4000(self):
        a = bytearray(synthetic_nor(3))
        b = bytearray(a)
        b[0x100000] ^= 0xFF          # fora do bloco: nao muda o checksum
        self.assertEqual(compute_checksum(a), compute_checksum(b))
        b[0x1C4062] ^= 0xFF          # dentro do bloco: muda
        self.assertNotEqual(compute_checksum(a), compute_checksum(b))


class PatchTest(unittest.TestCase):
    def changed_offsets(self, a: bytes, b: bytes) -> list[int]:
        return [i for i in range(len(a)) if a[i] != b[i]]

    def test_nuvoton_muda_so_chip_e_checksum(self):
        src = synthetic_nor(1)
        out = apply_patch(src, TARGET_NUVOTON).data
        self.assertEqual(out[OFFSET_CHIP_SELECT], 0xFF)
        self.assertEqual(set(self.changed_offsets(src, out)) - {OFFSET_CHECKSUM, OFFSET_CHECKSUM + 1},
                         {OFFSET_CHIP_SELECT})
        self.assertEqual(word_sum(out), 0)

    def test_panasonic_zera_pareamento_flag_e_incrementa_contador(self):
        src = synthetic_nor(2)
        out = apply_patch(src, TARGET_PANASONIC).data
        self.assertEqual(out[OFFSET_CHIP_SELECT], 0xFF)
        self.assertEqual(out[0x1C40C6:0x1C40DA], b"\xFF" * 20)
        self.assertEqual(out[0x1C4923], 0xFF)
        counter_old = (src[0x1C49BE] << 8) | src[0x1C49BF]
        self.assertEqual((out[0x1C49BE] << 8) | out[0x1C49BF], (counter_old + 1) & 0xFFFF)
        self.assertEqual(word_sum(out), 0)

    def test_dados_do_console_nao_sao_tocados(self):
        src = synthetic_nor(4)
        for target in (TARGET_NUVOTON, TARGET_PANASONIC, TARGET_REALTEK):
            out = apply_patch(src, target).data
            for start, length in ((0x1C4020, 6), (0x1C7200, 33), (0x1C7230, 13), (0x1C73C0, 6), (0x1C8C30, 8)):
                self.assertEqual(out[start:start + length], src[start:start + length], target)

    def test_alvo_invalido(self):
        with self.assertRaises(ValueError):
            apply_patch(synthetic_nor(), "xbox")


@unittest.skipUnless((REAL_DIR / "PS5 Slin RealTek_panasonic.bin").exists(), "NORs reais nao disponiveis")
class RealFilesTest(unittest.TestCase):
    """Compara com os arquivos gerados pelo Conversor HDMI PS5 (2026-10-28)."""

    def setUp(self):
        self.real = (REAL_DIR / "PS5 Slin RealTek.bin").read_bytes()

    def test_nuvoton_identico_ao_conversor(self):
        expected = (REAL_DIR / "PS5 Slin RealTek_nuvoton.bin").read_bytes()
        self.assertEqual(apply_patch(self.real, TARGET_NUVOTON).data, expected)

    def test_panasonic_identico_ao_conversor(self):
        expected = (REAL_DIR / "PS5 Slin RealTek_panasonic.bin").read_bytes()
        self.assertEqual(apply_patch(self.real, TARGET_PANASONIC).data, expected)


if __name__ == "__main__":
    unittest.main()
