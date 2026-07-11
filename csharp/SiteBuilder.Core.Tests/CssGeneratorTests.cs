// ============================================================
// CssGeneratorTests.cs - css-generator.js の挙動を C# 側で固定するテスト。
// 期待値は JS 版のロジックから逐次導出しており、両者の一致を保証する。
// ============================================================
using System.Collections.Generic;
using SiteBuilder.Core;
using Xunit;

namespace SiteBuilder.Core.Tests;

public class CssGeneratorTests
{
    // ---- EscapeHtml ----------------------------------------------------

    [Fact]
    public void EscapeHtml_escapes_all_five_entities()
    {
        Assert.Equal("&lt;x&gt;&quot;&amp;&#039;", CssGenerator.EscapeHtml("<x>\"&'"));
    }

    [Fact]
    public void EscapeHtml_null_becomes_empty()
    {
        Assert.Equal(string.Empty, CssGenerator.EscapeHtml(null));
    }

    // ---- ResolveImageSrc ----------------------------------------------

    [Fact]
    public void ResolveImageSrc_maps_data_uri_when_present()
    {
        var map = new Dictionary<string, string> { ["data:image/png;base64,AAA"] = "images/a.png" };
        Assert.Equal("images/a.png", CssGenerator.ResolveImageSrc("data:image/png;base64,AAA", map));
    }

    [Fact]
    public void ResolveImageSrc_passes_through_non_data_uri()
    {
        var map = new Dictionary<string, string>();
        Assert.Equal("images/x.png", CssGenerator.ResolveImageSrc("images/x.png", map));
    }

    // ---- GradientBgDecl -----------------------------------------------

    [Fact]
    public void GradientBgDecl_off_returns_solid_color()
    {
        var p = new ElementProps { Gradient = new GradientProps { On = false } };
        Assert.Equal("background-color: #ffcc00;", CssGenerator.GradientBgDecl(p, "#ffcc00"));
    }

    [Fact]
    public void GradientBgDecl_linear_uses_direction_angle_and_defaults()
    {
        var p = new ElementProps { Gradient = new GradientProps { On = true, Dir = "h" } };
        Assert.Equal("background: linear-gradient(90deg, #4facfe, #00f2fe);",
            CssGenerator.GradientBgDecl(p, "#000000"));
    }

    [Fact]
    public void GradientBgDecl_radial()
    {
        var p = new ElementProps { Gradient = new GradientProps { On = true, Type = "radial", C1 = "#111", C2 = "#222" } };
        Assert.Equal("background: radial-gradient(circle, #111, #222);",
            CssGenerator.GradientBgDecl(p, "#000000"));
    }

    // ---- StrokeDecl ----------------------------------------------------

    [Fact]
    public void StrokeDecl_border_for_non_label()
    {
        var p = new ElementProps { Stroke = new StrokeProps { On = true, Width = 3, Color = "#000000" } };
        Assert.Equal(" border: 3px solid #000000;", CssGenerator.StrokeDecl(p, "Button"));
    }

    [Fact]
    public void StrokeDecl_text_stroke_for_label()
    {
        var p = new ElementProps { Stroke = new StrokeProps { On = true, Width = 2, Color = "#fff" } };
        Assert.Equal(" -webkit-text-stroke: 2px #fff;", CssGenerator.StrokeDecl(p, "Label"));
    }

    [Fact]
    public void StrokeDecl_zero_width_returns_empty()
    {
        var p = new ElementProps { Stroke = new StrokeProps { On = true, Width = 0 } };
        Assert.Equal(string.Empty, CssGenerator.StrokeDecl(p, "Button"));
    }

    // ---- TextExtraCss --------------------------------------------------

    [Fact]
    public void TextExtraCss_combines_italic_underline_spacing_lineheight()
    {
        var p = new ElementProps { Italic = true, Underline = true, LetterSpacing = 1.5, LineHeight = 1.6 };
        Assert.Equal(" font-style: italic; text-decoration: underline; letter-spacing: 1.5px; line-height: 1.6;",
            CssGenerator.TextExtraCss(p));
    }

    [Fact]
    public void TextExtraCss_zero_values_are_skipped()
    {
        var p = new ElementProps { LetterSpacing = 0, LineHeight = 0 };
        Assert.Equal(string.Empty, CssGenerator.TextExtraCss(p));
    }

    // ---- CombinedShadowDecl -------------------------------------------

    [Fact]
    public void CombinedShadow_dropshadow_box_with_spread()
    {
        var p = new ElementProps
        {
            DropShadow = new DropShadowProps { On = true, X = 2, Y = 4, Blur = 6, Spread = 0, Color = "#000000", Opacity = 0.35 }
        };
        Assert.Equal("box-shadow: 2px 4px 6px 0px rgba(0, 0, 0, 0.35);",
            CssGenerator.CombinedShadowDecl(p, "Button"));
    }

    [Fact]
    public void CombinedShadow_dropshadow_text_has_no_spread()
    {
        var p = new ElementProps
        {
            DropShadow = new DropShadowProps { On = true, X = 1, Y = 1, Blur = 3, Spread = 5, Color = "#000000", Opacity = 0.5 }
        };
        Assert.Equal("text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);",
            CssGenerator.CombinedShadowDecl(p, "Label"));
    }

    [Fact]
    public void CombinedShadow_preset_used_when_no_dropshadow()
    {
        var p = new ElementProps { Shadow = "light" };
        Assert.Equal("box-shadow: 0 4px 10px rgba(0,0,0,0.15);",
            CssGenerator.CombinedShadowDecl(p, "Button"));
    }

    [Fact]
    public void CombinedShadow_bevel_up_emits_two_inset_layers()
    {
        var p = new ElementProps
        {
            Bevel = new BevelProps { On = true, Depth = 2, Opacity = 0.5, Highlight = "#ffffff", Shadow = "#000000", Dir = "up" }
        };
        Assert.Equal(
            "box-shadow: inset 2px 2px 4px rgba(255, 255, 255, 0.5), inset -2px -2px 4px rgba(0, 0, 0, 0.5);",
            CssGenerator.CombinedShadowDecl(p, "Button"));
    }

    [Fact]
    public void CombinedShadow_none_returns_empty()
    {
        Assert.Equal(string.Empty, CssGenerator.CombinedShadowDecl(new ElementProps(), "Button"));
    }

    // ---- WrapGradText --------------------------------------------------

    [Fact]
    public void WrapGradText_off_returns_text_unchanged()
    {
        Assert.Equal("hello", CssGenerator.WrapGradText("hello", new ElementProps()));
    }

    [Fact]
    public void WrapGradText_on_wraps_in_span_with_clip_style()
    {
        var p = new ElementProps { GradText = new GradientProps { On = true, Dir = "h", C1 = "#ff6ec4", C2 = "#7873f5" } };
        Assert.Equal(
            "<span style=\"background: linear-gradient(90deg, #ff6ec4, #7873f5); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;\">Hi</span>",
            CssGenerator.WrapGradText("Hi", p));
    }
}
