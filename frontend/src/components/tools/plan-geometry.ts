/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — PLAN GEOMETRY (logic thuần, không side-effect)
   ───────────────────────────────────────────────────────────────────────
   Toán xoay/chiếu dùng cho 2D plan overlay khi căn theo True North
   (`plan-overlay.ts`). Tách riêng để unit-test — sai dấu trong lượng giác
   rất dễ xảy ra và khó phát hiện bằng mắt nếu không kiểm chứng bằng số.

   Quy ước: mặt phẳng world (x,z) nhìn từ trên xuống (-Y). Ở tnAngle=0,
   "màn hình phải" = world +X, "màn hình trên" = world -Z (Bắc dự án/mặc định).
   Xoay bằng tnAngle quay hệ trục màn hình theo công thức đã có sẵn trong code
   gốc cho camera.up: up(tn) = (-sin(tn), 0, -cos(tn)).
═══════════════════════════════════════════════════════════════════════ */

export interface PlanBasis { rx: number; rz: number; ux: number; uz: number; }

// Hệ trục màn hình (screen-right, screen-up) trong world (x,z), đã xoay theo tnAngle.
// tnAngle=0 → rx=1,rz=0 (phải=+X), ux=0,uz=-1 (trên=-Z) — khớp hệ trục gốc trước khi có True North.
export function planBasis(tnAngle: number): PlanBasis {
  return {
    rx: Math.cos(tnAngle), rz: -Math.sin(tnAngle),
    ux: -Math.sin(tnAngle), uz: -Math.cos(tnAngle),
  };
}

export interface OrthoFrustum { left: number; right: number; top: number; bottom: number; }
export interface CamPos2D { x: number; z: number; }

// World (wx,wz) → phân số màn hình (u,v ∈ 0..1; v=0 ở cam.top, v=1 ở cam.bottom).
export function worldToUV(wx: number, wz: number, cam: CamPos2D, f: OrthoFrustum, tnAngle: number): [number, number] {
  const b = planBasis(tnAngle);
  const dx = wx - cam.x, dz = wz - cam.z;
  const rightComp = dx * b.rx + dz * b.rz;
  const upComp = dx * b.ux + dz * b.uz;
  const fw = f.right - f.left, fh = f.top - f.bottom;
  const u = (rightComp - f.left) / fw;
  const v = 1 - (upComp - f.bottom) / fh;
  return [u, v];
}

// Nghịch đảo của worldToUV: phân số màn hình (u,v) → world (wx,wz).
export function uvToWorld(u: number, v: number, cam: CamPos2D, f: OrthoFrustum, tnAngle: number): [number, number] {
  const b = planBasis(tnAngle);
  const fw = f.right - f.left, fh = f.top - f.bottom;
  const rightComp = u * fw + f.left;
  const upComp = (1 - v) * fh + f.bottom;
  const wx = cam.x + rightComp * b.rx + upComp * b.ux;
  const wz = cam.z + rightComp * b.rz + upComp * b.uz;
  return [wx, wz];
}

export interface Bounds2D { minX: number; maxX: number; minZ: number; maxZ: number; }

// Độ trải rộng (sx,sz) của bbox trục-thẳng khi nhìn từ hệ trục ĐÃ XOAY — tức
// là chiếu 4 góc bbox lên (screenRight, screenUp) rồi lấy khoảng min→max.
// Dùng để fit khung nhìn không bị cắt góc khi plan xoay (khác với bbox thô
// sx=maxX-minX, sz=maxZ-minZ chỉ đúng khi tnAngle=0).
export function rotatedExtent(b: Bounds2D, tnAngle: number): { sx: number; sz: number } {
  const bas = planBasis(tnAngle);
  const corners: [number, number][] = [
    [b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ],
  ];
  let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity;
  for (const [x, z] of corners) {
    const r = x * bas.rx + z * bas.rz;
    const u = x * bas.ux + z * bas.uz;
    if (r < minR) minR = r; if (r > maxR) maxR = r;
    if (u < minU) minU = u; if (u > maxU) maxU = u;
  }
  return { sx: maxR - minR, sz: maxU - minU };
}
