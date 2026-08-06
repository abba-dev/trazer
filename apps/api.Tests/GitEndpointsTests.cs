using System.Text.RegularExpressions;
using Xunit;

namespace Trazer.Api.Tests;

// Mirrors the ClosePattern/RefPattern in GitEndpoints so the matching rules are locked down
// without needing a live database.
public class GitEndpointsTests
{
    private static readonly Regex ClosePattern = new(
        @"(?i)(?:fix(?:es|ed)?|clos(?:e|es|ed)?|resolv(?:e|es|ed)?)\s+(?:#?)([A-Z][A-Z0-9]{1,9})-(\d+)",
        RegexOptions.Compiled);

    private static (string Key, int Number)? MatchClose(string message, string projectKey)
    {
        foreach (Match m in ClosePattern.Matches(message))
        {
            if (m.Groups[1].Value.ToUpperInvariant() == projectKey && int.TryParse(m.Groups[2].Value, out var n))
                return (m.Groups[1].Value.ToUpperInvariant(), n);
        }
        return null;
    }

    [Theory]
    [InlineData("fixes GAME-42", "GAME", 42)]
    [InlineData("Fixed #GAME-7", "GAME", 7)]
    [InlineData("FIX GAME-1", "GAME", 1)]
    [InlineData("closes GAME-100", "GAME", 100)]
    [InlineData("this CLOSED game-12 now", "GAME", 12)]
    [InlineData("resolves GAME-3", "GAME", 3)]
    [InlineData("resolve #game-9", "GAME", 9)]
    [InlineData("ref GAME-23 (fixes #GAME-24)", "GAME", 24)]
    public void ClosePattern_matches_close_keywords(string message, string projectKey, int number)
    {
        var match = MatchClose(message, projectKey);
        Assert.NotNull(match);
        Assert.Equal((projectKey, number), match);
    }

    [Theory]
    [InlineData("mentions GAME-42 but does not close", "GAME")]
    [InlineData("update Game-42 wip", "GAME")]
    [InlineData("FIXME: rewrite", "GAME")]
    [InlineData("fixes OTHER-42", "GAME")] // foreign project key is ignored
    public void ClosePattern_ignores_non_close_refs(string message, string projectKey)
    {
        Assert.Null(MatchClose(message, projectKey));
    }
}