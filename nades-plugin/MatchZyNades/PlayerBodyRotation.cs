using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;

namespace MatchZyNades;

public static class PlayerBodyRotation
{
    // CS2 can apply Teleport's view pitch/roll to the pawn scene node as well.
    // Keep both body transforms upright WITHOUT changing eye angles, yaw or origin.
    // See MatchZy #393 and MatchZy-Enhanced PR #13 (linked in docs/nades-menu.md).
    public static bool Repair(CCSPlayerPawn pawn)
    {
        var scene = pawn.CBodyComponent?.SceneNode;
        if (scene == null || scene.PParent != null) return false;
        var local = scene.Rotation;
        var absolute = scene.AbsRotation;
        if (local.X == 0f && local.Z == 0f && absolute.X == 0f && absolute.Z == 0f) return false;

        local.X = 0f;
        local.Z = 0f;
        absolute.X = 0f;
        absolute.Z = 0f;
        Utilities.SetStateChanged(pawn, "CBaseEntity", "m_CBodyComponent");
        return true;
    }
}
