// ============================================================
// Models.cs - 要素プロパティのデータモデル（css-generator.js が読む形を型付けで再現）
// JS 側は動的な props オブジェクトだが、C# では明示的な型に落とす。
// 既定値の適用は CssGenerator 側で JS と同じ挙動になるよう行う。
// ============================================================
namespace SiteBuilder.Core;

/// <summary>グラデーション設定（背景・文字塗り共用）。JS: props.gradient / props.gradText</summary>
public sealed class GradientProps
{
    public bool On { get; set; }
    /// <summary>"linear"(既定) / "radial"。gradText では未使用。</summary>
    public string? Type { get; set; }
    /// <summary>"v" | "h" | "d1" | "d2"</summary>
    public string? Dir { get; set; }
    public string? C1 { get; set; }
    public string? C2 { get; set; }
}

/// <summary>境界線 / 縁取り。JS: props.stroke</summary>
public sealed class StrokeProps
{
    public bool On { get; set; }
    public double? Width { get; set; }
    public string? Color { get; set; }
}

/// <summary>ドロップシャドウ。JS: props.dropShadow</summary>
public sealed class DropShadowProps
{
    public bool On { get; set; }
    public double? X { get; set; }
    public double? Y { get; set; }
    public double? Blur { get; set; }
    public double? Spread { get; set; }
    public string? Color { get; set; }
    public double? Opacity { get; set; }
}

/// <summary>外側グロー（光彩）。JS: props.glow</summary>
public sealed class GlowProps
{
    public bool On { get; set; }
    public string? Color { get; set; }
    public double? Opacity { get; set; }
    public double? Blur { get; set; }
    public double? Spread { get; set; }
}

/// <summary>内側シャドウ。JS: props.innerShadow</summary>
public sealed class InnerShadowProps
{
    public bool On { get; set; }
    public double? X { get; set; }
    public double? Y { get; set; }
    public double? Blur { get; set; }
    public string? Color { get; set; }
    public double? Opacity { get; set; }
}

/// <summary>ベベル＆エンボス。JS: props.bevel</summary>
public sealed class BevelProps
{
    public bool On { get; set; }
    public double? Depth { get; set; }
    public double? Opacity { get; set; }
    public string? Highlight { get; set; }
    public string? Shadow { get; set; }
    /// <summary>"down"(凹) / それ以外(凸)</summary>
    public string? Dir { get; set; }
}

/// <summary>要素のプロパティ集合。css-generator.js が参照するフィールドを網羅する。</summary>
public sealed class ElementProps
{
    public GradientProps? Gradient { get; set; }
    public StrokeProps? Stroke { get; set; }

    public bool Italic { get; set; }
    public bool Underline { get; set; }
    public double? LetterSpacing { get; set; }
    public double? LineHeight { get; set; }

    public DropShadowProps? DropShadow { get; set; }
    /// <summary>プリセット影のキー: "light" | "dark" | "hard" | "diagonal" | "float"</summary>
    public string? Shadow { get; set; }
    public GlowProps? Glow { get; set; }
    public InnerShadowProps? InnerShadow { get; set; }
    public BevelProps? Bevel { get; set; }

    public GradientProps? GradText { get; set; }
}

/// <summary>使用フォント判定用の Google Fonts エントリ。JS: GOOGLE_FONTS</summary>
public readonly record struct GoogleFont(string Family, string Spec);
