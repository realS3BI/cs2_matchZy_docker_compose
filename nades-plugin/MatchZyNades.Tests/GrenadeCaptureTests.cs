using System.Reflection;
using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class GrenadeCaptureTests
{
    [Theory]
    [InlineData("molotov")]
    [InlineData("weapon_molotov")]
    [InlineData("incgrenade")]
    [InlineData("weapon_incgrenade")]
    [InlineData("incendiary")]
    [InlineData("weapon_incendiary")]
    [InlineData("WEAPON_MOLOTOV")]
    [InlineData(" incgrenade ")]
    public void RecognizesFireGrenadeThrowsAndCompletesTheirCapture(string weapon)
    {
        var classify = typeof(MatchZyNadesPlugin).GetMethod("ThrownKind", BindingFlags.NonPublic | BindingFlags.Static)!;
        var kind = (NadeKind)classify.Invoke(null, [weapon])!;
        Assert.Equal(NadeKind.Fire, kind);

        var tracker = new NadeCaptureTracker();
        var lineup = new NadeLineup("7655", "capture_fire", "de_mirage", NadeKind.Fire,
            "", new(1, 2, 3), new(4, 5, 6));
        tracker.Arm(1, 7655, lineup, 0);
        Assert.True(tracker.Thrown(1, 7655, kind, 1));
        Assert.Equal(lineup, tracker.CompleteByThrower(1, 7655, NadeKind.Fire, "de_mirage", 3));
        Assert.Null(tracker.CompleteByThrower(1, 7655, NadeKind.Fire, "de_mirage", 4));
    }

    [Theory]
    [InlineData("smokegrenade", NadeKind.Smoke)]
    [InlineData("weapon_smokegrenade", NadeKind.Smoke)]
    [InlineData("flashbang", NadeKind.Flash)]
    [InlineData("weapon_flashbang", NadeKind.Flash)]
    [InlineData("hegrenade", NadeKind.HE)]
    [InlineData("weapon_hegrenade", NadeKind.HE)]
    [InlineData("decoy", NadeKind.Decoy)]
    [InlineData("weapon_decoy", NadeKind.Decoy)]
    [InlineData("weapon_ak47", NadeKind.Other)]
    [InlineData("unknown", NadeKind.Other)]
    [InlineData("", NadeKind.Other)]
    public void KeepsOtherGrenadeTypesDistinctAndRejectsUnknownWeapons(string weapon, NadeKind expected)
    {
        var classify = typeof(MatchZyNadesPlugin).GetMethod("ThrownKind", BindingFlags.NonPublic | BindingFlags.Static)!;
        Assert.Equal(expected, (NadeKind)classify.Invoke(null, [weapon])!);
    }
}
