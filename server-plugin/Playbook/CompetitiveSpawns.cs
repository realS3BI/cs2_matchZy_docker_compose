using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Utils;

namespace Playbook;

public sealed record CompetitiveSpawn(string Map, uint EntityIndex, int Team, int Priority, bool Enabled,
    Coordinates Position, Coordinates Angles);

public static class CompetitiveSpawns
{
    // Lower numeric priorities are preferred by CS2. Select each side independently;
    // custom maps need not use the same priority or number of spawns on both sides.
    public static IReadOnlyList<CompetitiveSpawn> Select(IEnumerable<CompetitiveSpawn> spawns) => spawns
        .Where(s => s.Enabled && s.Team is 2 or 3 && Finite(s.Position) && Finite(s.Angles))
        .GroupBy(s => s.Team)
        .SelectMany(team => team.Where(s => s.Priority == team.Min(p => p.Priority)))
        .OrderBy(s => s.Team).ThenBy(s => s.EntityIndex).ToArray();

    private static bool Finite(Coordinates p) => float.IsFinite(p.X) && float.IsFinite(p.Y) && float.IsFinite(p.Z);
}

public sealed partial class PlaybookPlugin
{
    private static IReadOnlyList<CompetitiveSpawn> ReadCompetitiveSpawns()
    {
        var result = new List<CompetitiveSpawn>();
        foreach (var (designerName, team) in new[] { ("info_player_terrorist", 2), ("info_player_counterterrorist", 3) })
            foreach (var entity in Utilities.FindAllEntitiesByDesignerName<SpawnPoint>(designerName))
            {
                if (!entity.IsValid || entity.CBodyComponent?.SceneNode is not { } node) continue;
                var p = node.AbsOrigin;
                var a = node.AbsRotation;
                result.Add(new(Server.MapName, entity.Index, team, entity.Priority, entity.Enabled,
                    new(p.X, p.Y, p.Z), new(a.X, a.Y, a.Z)));
            }
        return CompetitiveSpawns.Select(result);
    }

    private void TeleportToSpawn(CCSPlayerController player, CompetitiveSpawn? selected)
    {
        if (!Alive(player) || !TrainingEnabled || selected == null) return;
        var spawn = ReadCompetitiveSpawns().FirstOrDefault(s => s.Map == selected.Map &&
            s.EntityIndex == selected.EntityIndex && s.Team == selected.Team);
        if (spawn == null) { Tell(player, "Dieser Spawn ist nicht mehr verfügbar. Öffne die Spawn-Auswahl erneut."); return; }
        var p = spawn.Position;
        if (Utilities.GetPlayers().Any(other => other.IsValid && other.Slot != player.Slot && other.PawnIsAlive &&
            other.PlayerPawn.Value?.AbsOrigin is { } pos &&
            Math.Abs(pos.X - p.X) < 32 && Math.Abs(pos.Y - p.Y) < 32 && Math.Abs(pos.Z - p.Z) < 72))
        { Tell(player, "Dieser Spawn ist gerade besetzt. Wähle einen anderen Spawn."); return; }
        var pawn = player.PlayerPawn.Value!;
        pawn.MoveType = MoveType_t.MOVETYPE_WALK;
        pawn.ActualMoveType = MoveType_t.MOVETYPE_WALK;
        Utilities.SetStateChanged(pawn, "CBaseEntity", "m_MoveType");
        pawn.Teleport(new Vector(p.X, p.Y, p.Z), new QAngle(spawn.Angles.X, spawn.Angles.Y, 0), new Vector(0, 0, 0));
        PlayerBodyRotation.Repair(pawn);
        Tell(player, $"Zum {(spawn.Team == 3 ? "CT" : "T")}-Spawn teleportiert. Dein Team bleibt unverändert.");
    }
}
