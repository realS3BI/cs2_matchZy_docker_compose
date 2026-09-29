using System.Text;
using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class PanelTextTests
{
    [Fact]
    public void HardWrappingDoesNotSplitEmojiOrKeepControlCharacters()
    {
        var text = "a" + string.Concat(Enumerable.Repeat("🔥", 60));
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
    public void UnicodeMessagesStayInsideNativeBufferWithoutLosingDetailPages()
    {
        var text = string.Join(' ', Enumerable.Repeat("日本語🔥", 150));
        var pages = PanelText.DetailPages(text);
        Assert.Equal(text, string.Join(' ', pages).Replace('\n', ' '));
        var menu = new InGameMenu(new("训练", text, Enumerable.Range(0, 5)
            .Select(_ => new MenuItem(new string('界', 80), text)).ToArray()), "de_mirage");
        for (var page = 0; page < pages.Count; page++)
        {
            var content = PanelText.Render(menu, true, true, page);
            Assert.All(new[] { content.Heading, content.Options, content.Selection, content.Details, content.Controls },
                s => Assert.True(Encoding.UTF8.GetByteCount(s) < 512));
            Assert.Contains(pages[page], content.Details);
        }
        Assert.Equal(5, PanelText.Render(menu, true, true, 0).Options.Split('\n').Length);
    }

    [Fact]
    public void PassiveDisplayKeepsSelectionAndFeedbackOverridesHint()
    {
        var menu = TrainingMenu.Create([], "de_mirage", true, null);
        menu.Move(2);
        var editing = PanelText.Render(menu, true, true, 0);
        var passive = PanelText.Render(menu, false, true, 0);
        Assert.Equal(editing.Selection, passive.Selection);
        Assert.Contains("BEDIENUNG AKTIV", editing.Heading);
        Assert.Contains("SPIELEN", passive.Heading);
        menu.Notice = "Aufnahme gespeichert.";
        Assert.Contains(menu.Notice, PanelText.Render(menu, false, true, 0).Details);
    }
}
