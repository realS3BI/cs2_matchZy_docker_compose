using System.Text;
using MatchZyNades;
using Xunit;
namespace MatchZyNades.Tests;
public sealed class PanelTextTests
{
    [Fact]
    public void DescriptionUsesFullLabelWidthWithoutArtificialLineBreaks()
    {
        var text = "Diese Beschreibung ist länger als 38 Zeichen und soll die gesamte verfügbare Breite nutzen.";
        Assert.Equal(text, PanelText.Description(text));
        Assert.Equal("eins zwei drei", PanelText.Description("eins\n zwei\t drei\u0001"));
    }
    [Fact]
    public void OversizedDescriptionEndsWithEllipsisAndPreservesUnicode()
    {
        var text = string.Concat(Enumerable.Repeat("Übung 🔥 日本語 ", 100));
        var result = PanelText.Description(text);
        Assert.EndsWith("...", result);
        Assert.True(new UTF8Encoding(false, true).GetByteCount(result) <= 420);
        Assert.StartsWith(result[..^3], text);
    }
}
