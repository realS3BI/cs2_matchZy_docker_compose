using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;

namespace Playbook;

public sealed partial class PlaybookPlugin
{
    private float? CompleteFlightTime(int? entityId, CCSPlayerController player, NadeKind kind)
    {
        var seconds = _flightTimes.Complete(entityId, player.Slot, player.SteamID, kind, Server.CurrentTime);
        // MatchZy provides its own feedback in Practice. Avoid printing every event twice.
        if (StandaloneTraining && seconds.HasValue)
            Tell(player, FormattableString.Invariant($"{NadeCatalog.Label(kind)}: Flugzeit bis zur Wirkung {seconds.Value:0.00} s."));
        return seconds;
    }

    private void RegisterNadeFeedback()
    {
        RegisterEventHandler<EventPlayerBlind>((e, _) => {
            if (StandaloneTraining && TrainingEnabled && e.Attacker is { IsValid: true, IsBot: false } attacker &&
                e.Userid is { IsValid: true } victim && float.IsFinite(e.BlindDuration) && e.BlindDuration >= 0)
                Tell(attacker, FormattableString.Invariant($"{MenuRenderer.Plain(victim.PlayerName, 60)} wurde {e.BlindDuration:0.00} s geblendet."));
            return HookResult.Continue;
        });
        RegisterEventHandler<EventPlayerHurt>((e, _) => {
            if (StandaloneTraining && TrainingEnabled && e.Attacker is { IsValid: true, IsBot: false } attacker &&
                e.Userid is { IsValid: true } victim && e.DmgHealth > 0 && (ThrownKind(e.Weapon) != NadeKind.Other || e.Weapon == "inferno"))
                Tell(attacker, $"{MenuRenderer.Plain(victim.PlayerName, 60)}: {e.DmgHealth} Granatenschaden, {e.Health} HP verbleibend.");
            return HookResult.Continue;
        });
    }
}
