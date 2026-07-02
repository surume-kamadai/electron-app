// ============================================================
// utils/color.js - 色・グラデーション関連の共有ユーティリティ
// css-generator（出力）と effect-overlay / gradient-overlay（エディタ表示）で共用。
// ============================================================

// #rrggbb / #rgb と不透明度(0〜1) → rgba() 文字列。
// 既に rgb(...)/rgba(...) が渡された場合はそのまま返す。
export function hexToRgba(hex, a) {
    const s = String(hex ?? '#000000');
    if (s.startsWith('rgb')) return s;   // すでに rgba(...) ならそのまま
    const h = s.replace('#', '');
    const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const r = parseInt(n.slice(0, 2), 16) || 0;
    const g = parseInt(n.slice(2, 4), 16) || 0;
    const b = parseInt(n.slice(4, 6), 16) || 0;
    const al = Math.min(1, Math.max(0, a ?? 1));
    return `rgba(${r}, ${g}, ${b}, ${al})`;
}

// 線形グラデーションの方向キー → CSS angle(deg)
export const GRADIENT_DEG = { v: 180, h: 90, d1: 135, d2: 225 };
