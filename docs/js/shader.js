// Fundo vivo em GLSL (WebGL puro, sem biblioteca): uma névoa violeta que reage ao ponteiro.
// Economiza bateria: meia resolução, 30 quadros por segundo e pausa fora da tela.
"use strict";

export const FRAG = `precision mediump float;
uniform vec2 uR; uniform float uT; uniform vec2 uP; uniform float uDark;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<3;i++){v+=a*n(p);p=mat2(1.6,1.2,-1.2,1.6)*p+7.;a*=.45;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/uR.y, c=uR/uR.y;
  float q=fbm(uv*1.1+vec2(uT*.05,-uT*.03));
  float w=fbm(uv*1.1+q*1.6-vec2(uT*.04,0.));
  vec2 d=uv-uP*c; float glow=exp(-dot(d,d)*7.);
  float v=w+glow*.3;
  vec3 a=uDark>.5?vec3(.16,.09,.44):vec3(.66,.58,1.);
  vec3 b=uDark>.5?vec3(.33,.16,.88):vec3(.49,.36,1.);
  vec3 e=uDark>.5?vec3(.46,.2,.9):vec3(.72,.46,.98);
  vec3 col=mix(mix(a,b,smoothstep(.3,.62,v)),e,smoothstep(.62,.86,v));
  float al=smoothstep(.2,.85,v)*(uDark>.5?.5:.26);
  gl_FragColor=vec4(col*al,al);
}`;

const VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

/** Liga o fundo no canvas. Sem WebGL devolve controles vazios: fica só o gradiente da página. */
export function startShader(canvas, isDark) {
  const none = { start() {}, stop() {} };
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, powerPreference: "low-power" });
  if (!gl) { canvas.remove(); return none; }
  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return none; }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.bindAttribLocation(prog, 0, "p");
  gl.linkProgram(prog); gl.useProgram(prog);
  gl.vertexAttribPointer(gl.getAttribLocation(prog, "p"), 2, gl.FLOAT, false, 0, 0);
  const u = Object.fromEntries(["uR", "uT", "uP", "uDark"].map((n) => [n, gl.getUniformLocation(prog, n)]));

  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const target = [0.7, 0.6], at = [0.7, 0.6];
  let raf = 0, last = 0, running = false, seen = true, t = 20;

  const size = () => {
    const w = Math.min(960, Math.ceil(canvas.clientWidth * 0.5)), h = Math.ceil(canvas.clientHeight * 0.5);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  };
  const draw = () => {
    size();
    at[0] += (target[0] - at[0]) * 0.06; at[1] += (target[1] - at[1]) * 0.06;
    gl.uniform2f(u.uR, canvas.width, canvas.height);
    gl.uniform1f(u.uT, t);
    gl.uniform2f(u.uP, at[0], at[1]);
    gl.uniform1f(u.uDark, isDark() ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const loop = (now) => {
    raf = 0;
    if (!running || !seen || document.hidden) return;
    raf = requestAnimationFrame(loop);
    if (now - last < 33) return;
    t += Math.min(now - last, 66) / 1000; last = now;
    draw();
  };
  const wake = () => { if (running && !calm && !raf) raf = requestAnimationFrame(loop); };

  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const r = canvas.getBoundingClientRect();
    target[0] = (e.clientX - r.left) / (r.width || 1);
    target[1] = 1 - (e.clientY - r.top) / (r.height || 1);
  }, { passive: true });
  document.addEventListener("visibilitychange", wake);
  addEventListener("resize", () => { if (running) draw(); }, { passive: true });
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; wake(); }).observe(canvas);
  canvas.addEventListener("webglcontextlost", () => { running = false; canvas.remove(); });
  new MutationObserver(() => { if (running) draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  return {
    start() { running = true; draw(); wake(); },
    stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
  };
}
