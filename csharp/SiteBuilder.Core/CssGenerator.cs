// ============================================================
// CssGenerator.cs - HTML/CSS 生成の純粋ヘルパー群
// JS 版 src/renderer/export/css-generator.js の忠実な移植。副作用なし・UI非依存。
// 挙動（既定値・エスケープ・数値フォーマット）を JS と 1:1 で一致させることを目標とする。
// ============================================================
using System.Collections.Generic;
using System.Globalization;

namespace SiteBuilder.Core;

public static class CssGenerator
{
    // アニメーション用CSS（出力HTMLの<style>へ差し込む）。JS: ANIM_CSS
    public const string AnimCss = @"
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideLeft { from { opacity: 0; transform: translateX(50px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideRight { from { opacity: 0; transform: translateX(-50px); } to { opacity: 1; transform: translateX(0); } }
        .anim-fadein    { animation: fadeIn    1s   cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .anim-fadeup    { animation: fadeUp    1s   cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .anim-scale     { animation: scaleIn   0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .anim-slideleft { animation: slideLeft  0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .anim-slideright{ animation: slideRight 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }";

    // エディタの選択肢と対応する Google Fonts。JS: GOOGLE_FONTS
    public static readonly IReadOnlyList<GoogleFont> GoogleFonts = new[]
    {
        new GoogleFont("Noto Sans JP",      "Noto+Sans+JP:wght@400;700"),
        new GoogleFont("Noto Serif JP",     "Noto+Serif+JP:wght@400;700"),
        new GoogleFont("M PLUS Rounded 1c", "M+PLUS+Rounded+1c:wght@400;700"),
        new GoogleFont("Zen Maru Gothic",   "Zen+Maru+Gothic:wght@400;700"),
        new GoogleFont("Kosugi Maru",       "Kosugi+Maru"),
        new GoogleFont("Sawarabi Mincho",   "Sawarabi+Mincho"),
        new GoogleFont("Yusei Magic",       "Yusei+Magic"),
        new GoogleFont("Dela Gothic One",   "Dela+Gothic+One"),
    };

    // HTML特殊文字をエスケープ。JS: escapeHtml
    public static string EscapeHtml(string? value)
    {
        return (value ?? string.Empty)
            .Replace("&", "&amp;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;")
            .Replace("\"", "&quot;")
            .Replace("'", "&#039;");
    }

    // data:image を imageMap で解決。JS: resolveImageSrc
    public static string? ResolveImageSrc(string? src, IReadOnlyDictionary<string, string> imageMap)
    {
        if (src is not null && src.StartsWith("data:image", System.StringComparison.Ordinal))
            return imageMap.TryGetValue(src, out var mapped) ? mapped : src;
        return src;
    }

    // 背景の CSS 宣言。グラデーション on なら background:gradient、それ以外は単色。JS: gradientBgDecl
    public static string GradientBgDecl(ElementProps props, string bgcolorEscaped)
    {
        var g = props.Gradient;
        if (g is { On: true })
        {
            var c1 = EscapeHtml(g.C1 ?? "#4facfe");
            var c2 = EscapeHtml(g.C2 ?? "#00f2fe");
            if (g.Type == "radial")
                return $"background: radial-gradient(circle, {c1}, {c2});";
            return $"background: linear-gradient({DirDeg(g.Dir, 180)}deg, {c1}, {c2});";
        }
        // bgcolor は #rrggbb か rgba(...)（透明度はピッカー内で色に含まれる）
        return $"background-color: {bgcolorEscaped};";
    }

    // 境界線(Stroke)のCSS宣言。図形/ボタン/画像は border、テキストは -webkit-text-stroke。JS: strokeDecl
    public static string StrokeDecl(ElementProps props, string? type)
    {
        var s = props.Stroke;
        if (s is not { On: true }) return string.Empty;
        var w = System.Math.Max(0, s.Width ?? 0);
        if (w <= 0) return string.Empty;
        var c = EscapeHtml(s.Color ?? "#000000");
        if (type == "Label") return $" -webkit-text-stroke: {Num(w)}px {c};";
        return $" border: {Num(w)}px solid {c};";
    }

    // テキストの 斜体/下線/字間/行間 のCSS（font-weight は各要素側で出力）。JS: textExtraCss
    public static string TextExtraCss(ElementProps props)
    {
        var s = string.Empty;
        if (props.Italic) s += " font-style: italic;";
        if (props.Underline) s += " text-decoration: underline;";
        var ls = props.LetterSpacing ?? 0; if (ls != 0) s += $" letter-spacing: {Num(ls)}px;";
        var lh = props.LineHeight ?? 0; if (lh != 0) s += $" line-height: {Num(lh)};";
        return s;
    }

    // シャドウ系プリセット（種別→CSS値）。Label は text-shadow に使う。JS: PRESET_SHADOW_CSS
    private static readonly IReadOnlyDictionary<string, string> PresetShadowCss = new Dictionary<string, string>
    {
        ["light"]    = "0 4px 10px rgba(0,0,0,0.15)",
        ["dark"]     = "0 8px 15px rgba(0,0,0,0.4)",
        ["hard"]     = "5px 5px 0 rgba(0,0,0,0.45)",
        ["diagonal"] = "10px 10px 14px rgba(0,0,0,0.3)",
        ["float"]    = "0 20px 30px rgba(0,0,0,0.28)",
    };

    // ドロップシャドウ ＋ 光彩 ＋ 内側シャドウ ＋ ベベル を
    // 1つの box-shadow(通常) / text-shadow(Label) に合成。JS: combinedShadowDecl
    public static string CombinedShadowDecl(ElementProps props, string? type)
    {
        var isText = type == "Label";
        var box = new List<string>();
        var txt = new List<string>();

        // 1) ドロップシャドウ（自由値優先、無ければプリセット）
        var ds = props.DropShadow;
        if (ds is { On: true })
        {
            var dx = ds.X ?? 0; var dy = ds.Y ?? 0;
            var dblur = System.Math.Max(0, ds.Blur ?? 0); var dspread = ds.Spread ?? 0;
            var drgba = HexToRgba(ds.Color ?? "#000000", ds.Opacity ?? 0.35);
            if (isText) txt.Add($"{Num(dx)}px {Num(dy)}px {Num(dblur)}px {drgba}");           // text-shadow はスプレッド非対応
            else        box.Add($"{Num(dx)}px {Num(dy)}px {Num(dblur)}px {Num(dspread)}px {drgba}");
        }
        else if (props.Shadow is not null && PresetShadowCss.TryGetValue(props.Shadow, out var preset))
        {
            (isText ? txt : box).Add(preset);
        }

        // 2) 光彩（外側グロー）
        var gl = props.Glow;
        if (gl is { On: true })
        {
            var grgba = HexToRgba(gl.Color ?? "#00d0ff", gl.Opacity ?? 0.8);
            var gblur = System.Math.Max(0, gl.Blur ?? 0); var gspread = gl.Spread ?? 0;
            if (isText) txt.Add($"0 0 {Num(gblur)}px {grgba}");
            else        box.Add($"0 0 {Num(gblur)}px {Num(gspread)}px {grgba}");
        }

        // 3) 内側シャドウ（テキスト非対応）
        var iss = props.InnerShadow;
        if (iss is { On: true } && !isText)
        {
            var ix = iss.X ?? 0; var iy = iss.Y ?? 0;
            var iblur = System.Math.Max(0, iss.Blur ?? 0);
            var irgba = HexToRgba(iss.Color ?? "#000000", iss.Opacity ?? 0.4);
            box.Add($"inset {Num(ix)}px {Num(iy)}px {Num(iblur)}px {irgba}");
        }

        // 4) ベベル＆エンボス（テキスト非対応）: 明暗2方向の内側シャドウで立体感
        var bv = props.Bevel;
        if (bv is { On: true } && !isText)
        {
            var d = System.Math.Max(1, bv.Depth ?? 1);
            var op = System.Math.Min(1, System.Math.Max(0, bv.Opacity ?? 0.5));
            var hl = HexToRgba(bv.Highlight ?? "#ffffff", op);
            var sh = HexToRgba(bv.Shadow ?? "#000000", op);
            var blur = d * 2;
            if (bv.Dir == "down")   // 凹（くぼみ）: 左上=影 / 右下=ハイライト
            {
                box.Add($"inset {Num(d)}px {Num(d)}px {Num(blur)}px {sh}");
                box.Add($"inset -{Num(d)}px -{Num(d)}px {Num(blur)}px {hl}");
            }
            else                    // 凸（浮き出し）: 左上=ハイライト / 右下=影
            {
                box.Add($"inset {Num(d)}px {Num(d)}px {Num(blur)}px {hl}");
                box.Add($"inset -{Num(d)}px -{Num(d)}px {Num(blur)}px {sh}");
            }
        }

        var arr = isText ? txt : box;
        if (arr.Count == 0) return string.Empty;
        return (isText ? "text-shadow: " : "box-shadow: ") + string.Join(", ", arr) + ";";
    }

    // テキストをグラデ文字 span で包む（off ならそのまま返す）。JS: wrapGradText
    public static string WrapGradText(string text, ElementProps props)
    {
        var st = GradTextSpanStyle(props);
        return st.Length > 0 ? $"<span style=\"{st}\">{text}</span>" : text;
    }

    // グラデーション文字（文字自体をグラデ塗り）。span に付けるスタイルを返す。JS: gradTextSpanStyle
    private static string GradTextSpanStyle(ElementProps props)
    {
        var g = props.GradText;
        if (g is not { On: true }) return string.Empty;
        var c1 = EscapeHtml(g.C1 ?? "#ff6ec4");
        var c2 = EscapeHtml(g.C2 ?? "#7873f5");
        var deg = DirDeg(g.Dir, 90);
        return $"background: linear-gradient({deg}deg, {c1}, {c2}); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;";
    }

    // #rrggbb(または#rgb) と不透明度 → rgba() 文字列。JS: hexToRgba
    private static string HexToRgba(string? hex, double a)
    {
        var h = (hex ?? "#000000").Replace("#", string.Empty);
        var n = h.Length == 3
            ? new string(new[] { h[0], h[0], h[1], h[1], h[2], h[2] })
            : h;
        var r = HexByte(n, 0);
        var g = HexByte(n, 2);
        var b = HexByte(n, 4);
        var al = System.Math.Min(1, System.Math.Max(0, a));
        return $"rgba({r}, {g}, {b}, {Num(al)})";
    }

    // n[start..start+2] を16進で読む。範囲外・不正は 0（JS の parseInt(...,16) || 0 と等価）
    private static int HexByte(string n, int start)
    {
        if (start >= n.Length) return 0;
        var len = System.Math.Min(2, n.Length - start);
        var slice = n.Substring(start, len);
        return int.TryParse(slice, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var v) ? v : 0;
    }

    // グラデ方向キー → 角度（度）。JS: DEG = { v:180, h:90, d1:135, d2:225 } と fallback
    private static int DirDeg(string? dir, int fallback) => dir switch
    {
        "v" => 180,
        "h" => 90,
        "d1" => 135,
        "d2" => 225,
        _ => fallback,
    };

    // JS のテンプレートリテラル ${number} 相当の数値フォーマット（ロケール非依存、末尾ゼロなし）
    private static string Num(double v) => v.ToString("0.############", CultureInfo.InvariantCulture);
}
