using System.Reflection;
using System.Text.RegularExpressions;
using CounterStrikeSharp.API.Modules.Utils;

namespace Playbook;

public static class PlaybookChat
{
    public const string DefaultPrefix = "[{Green}Playbook{Default}]";

    public static string Prefix(string? configured)
    {
        var value = configured?.Trim().Trim('"');
        if (string.IsNullOrWhiteSpace(value) || value == "[{Green}MatchZy{Default}]") value = DefaultPrefix;
        return Regex.Replace(value, @"\{(\w+)\}", match =>
            typeof(ChatColors).GetField(match.Groups[1].Value, BindingFlags.Public | BindingFlags.Static)?.GetValue(null)?.ToString() ?? "");
    }
}

public sealed partial class PlaybookPlugin
{
    private string ChatPrefix => MatchZyState.ChatPrefix() ?? PlaybookChat.Prefix(Environment.GetEnvironmentVariable("PLAYBOOK_CHAT_PREFIX"));
    private string ChatMessage(string message) => $"{ChatPrefix} {message}";
}
