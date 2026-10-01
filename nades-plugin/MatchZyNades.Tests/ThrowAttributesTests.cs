using System.Text.Json;
using MatchZyNades;
using Xunit;

namespace MatchZyNades.Tests;

public sealed class ThrowAttributesTests
{
    [Theory]
    [InlineData("Attack", "left")]
    [InlineData("Attack2", "right")]
    [InlineData("Attack, Attack2", "both")]
    public void DetectsAttackCombinationBeforeRelease(string buttons, string clickType)
    {
        ThrowSample[] samples = [new(1, "0 0 0", "0 0 0", "0 0 0", buttons), new(1.1f, "0 0 0", "0 0 0", "0 0 0", "0")];
        Assert.Equal(clickType, ThrowAttributes.Detect(samples).ClickType);
    }

    [Fact]
    public void DetectsJumpCrouchWalkRunAndSmallStepsWithoutUsingOldSetupMovement()
    {
        ThrowSample[] samples = [new(0, "0 0 0", "200 0 0", "0 0 0", "Jump, Duck"),
            new(9.8f, "100 0 0", "80 0 0", "0 0 0", "Walk, Attack2"), new(10, "108 0 0", "80 0 150", "0 0 0", "Walk")];
        var attributes = ThrowAttributes.Detect(samples);
        Assert.True(attributes.IsJumpthrow);
        Assert.False(attributes.IsCrouch);
        Assert.True(attributes.IsWalking);
        Assert.False(attributes.IsRunning);
        Assert.True(attributes.IsStepping);
        Assert.Equal("right", attributes.ClickType);
        Assert.True(ThrowAttributes.Detect([samples[1] with { Buttons = "Duck, Attack", Velocity = "180 0 0" }]).IsRunning);
        Assert.True(ThrowAttributes.Detect([samples[1] with { Buttons = "Duck, Attack" }]).IsCrouch);
        Assert.False(ThrowAttributes.Detect([samples[1] with { Buttons = "Walk, Attack", Velocity = "0 0 0" }]).IsWalking);
    }

    [Fact]
    public void CapturedAttributesUseTheSameJsonContractAsTheWebsite()
    {
        var path = Path.Combine(Path.GetTempPath(), "nade-attributes-" + Guid.NewGuid(), "captures.json");
        try {
            var capture = NadeCaptureFile.CreateNew("7655", "window", "Fenster", "de_mirage", NadeKind.Smoke,
                new(1, 2, 3), new(0, 90, 0), new(10, 20, 30), "Jumpthrow", "[]", new(IsJumpthrow: true, ClickType: "both"), "ct", 3.125f);
            NadeCaptureFile.Write(path, capture);
            using var json = JsonDocument.Parse(File.ReadAllText(path));
            var entry = json.RootElement[0];
            Assert.True(entry.GetProperty("is_jumpthrow").GetBoolean());
            Assert.False(entry.GetProperty("is_crouch").GetBoolean());
            Assert.Equal("both", entry.GetProperty("click_type").GetString());
            Assert.Equal("ct", entry.GetProperty("team").GetString());
            Assert.Equal(3.125f, entry.GetProperty("flightDuration").GetSingle());
        } finally { if (Directory.Exists(Path.GetDirectoryName(path))) Directory.Delete(Path.GetDirectoryName(path)!, true); }
    }
}
