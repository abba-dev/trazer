using Trazer.Api.Domain;
using Trazer.Api.Features;

namespace Trazer.Api.Tests;

public class GithubImportTests
{
    private static readonly string[] Header =
        ["number", "title", "labels", "state", "assignee", "author", "date_created", "date_updated", "date_closed",
         "body", "comments", "url", "type", "priority", "reporter", "pr_number", "milestone", "timelog"];

    private static GithubIssue ParseRow(params string[] values)
    {
        var csv = Csv(Header, values);
        var rows = CsvParser.Parse(csv);
        return GithubIssue.From(rows[0]);
    }

    // Proper RFC 4180 quoting so commas/quotes/newlines inside values survive.
    private static string Csv(string[] header, string[] values)
    {
        string Field(string s) =>
            s.IndexOfAny([',', '"', '\n', '\r']) >= 0
                ? '"' + s.Replace("\"", "\"\"") + '"'
                : s;
        return string.Join(',', header.Select(Field)) + "\n" + string.Join(',', values.Select(Field));
    }

    [Fact]
    public void Open_Issue_Maps_To_ToDo_And_Closed_To_Done()
    {
        Assert.Equal(IssueStatus.ToDo, ParseRow("12", "Add dark mode", "", "open", "", "alice", "", "", "", "", "", "", "Issue", "Medium", "", "", "v2.0", "").Status);
        Assert.Equal(IssueStatus.Done, ParseRow("13", "Fix crash", "", "closed", "", "bob", "", "", "", "", "", "", "Issue", "High", "", "", "v2.0", "").Status);
    }

    [Fact]
    public void Pull_Requests_Are_Skipped_With_A_Reason()
    {
        var issue = ParseRow("14", "Merge PR", "", "open", "", "carol", "", "", "", "", "", "", "Pull Request", "", "", "14", "", "");
        Assert.Equal("pull request (not an issue)", issue.SkipReason);
    }

    [Fact]
    public void Labels_And_Milestone_Are_Mapped()
    {
        var issue = ParseRow("15", "Support IPv6", "bug, backend", "open", "", "dave", "", "", "", "", "", "", "Issue", "High", "", "", "1.5", "");
        Assert.Equal(["bug", "backend"], issue.LabelNames);
        Assert.Equal("1.5", issue.ReleaseName);
    }

    [Fact]
    public void Number_Becomes_SourceKey_And_Body_Becomes_Description()
    {
        var issue = ParseRow("16", "Crash on boot", "", "open", "", "erin", "", "", "", "Stack trace:\nline 3", "", "", "Issue", "Low", "", "", "", "");
        Assert.Equal("16", issue.Key);
        Assert.Contains("Stack trace", issue.Description);
    }

    [Fact]
    public void Handles_Quoted_Fields_With_Commas_And_Newlines()
    {
        var rows = CsvParser.Parse(Csv(Header,
            ["18", "Title, with comma", "a, b", "open", "", "frank", "", "", "", "Body \"quoted\"", "", "", "Issue", "High", "", "", "", ""]));
        var issue = GithubIssue.From(rows[0]);
        Assert.Equal("18", issue.Key);
        Assert.Equal("Title, with comma", issue.Title);
        Assert.Equal(["a", "b"], issue.LabelNames);
        Assert.Equal("Body \"quoted\"", issue.Description);
    }
}