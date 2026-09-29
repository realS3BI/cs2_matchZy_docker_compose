using System.Text;
using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class PanelTextTests
{
    [Fact]
    public void HardWrappingDoesNotSplitEmojiOrKeepControlCharacters()
    {
        var text = "a" + string.Concat(Enumerable.Repeat("ðŸ”¥", 60));
        var lines = PanelText.Wrap(text + "\u0001");
        Assert.Equal(text, string.Concat(lines));
        var strictUtf8 = new UTF8Encoding(false, true);
        Assert.All(lines, line => Assert.True(strictUtf8.GetByteCount(line) > 0));
    }

    [Fact]
    public void LongDescriptionsCanBeReadCompletelyAcrossPages()
    {
        var words = Enumerable.Range(0, 150).Select(i => $"Beschreibung{i}").ToArray();
        var pages = PanelText.DetailPages(string.Join(' ', words));
        Assert.True(pages.Count > 1);
        Assert.Equal(words, string.Join(' ', pages).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        Assert.All(pages, p => Assert.True(Encoding.UTF8.GetByteCount(p) <= 420));
    }

    [Fact]
    public void UnicodeDescriptionsRemainCompleteAcrossBoundedPages()
    {
        var text = string.Join(' ', Enumerable.Repeat("æ—¥æœ¬èªžðŸ”¥", 150));
        var pages = PanelText.DetailPages(text);
        Assert.Equal(text, string.Join(' ', pages).Replace('\n', ' '));
        Assert.All(pages, p => Assert.True(Encoding.UTF8.GetByteCount(p) <= 420));
    }
}
