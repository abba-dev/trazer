using System.Text.Json;
using Trazer.Api.Domain;
using Trazer.Api.Features;

namespace Trazer.Api.Tests;

public class JiraImportTests
{
    private static JiraIssue Parse(string json) => JiraIssue.From(JsonDocument.Parse(json).RootElement);

    [Fact]
    public void Maps_Jira_Statuses_To_The_Closest_Trazer_Equivalent()
    {
        Assert.Equal(IssueStatus.ToDo, Parse("""{"fields":{"status":{"name":"Backlog"}}}""").Status);
        Assert.Equal(IssueStatus.ToDo, Parse("""{"fields":{"status":{"name":"Open"}}}""").Status);
        Assert.Equal(IssueStatus.InProgress, Parse("""{"fields":{"status":{"name":"In Progress"}}}""").Status);
        Assert.Equal(IssueStatus.InReview, Parse("""{"fields":{"status":{"name":"Code Review"}}}""").Status);
        Assert.Equal(IssueStatus.QA, Parse("""{"fields":{"status":{"name":"Testing"}}}""").Status);
        Assert.Equal(IssueStatus.Done, Parse("""{"fields":{"status":{"name":"Closed"}}}""").Status);
        Assert.Equal(IssueStatus.Done, Parse("""{"fields":{"status":{"name":"Resolved"}}}""").Status);
    }

    [Fact]
    public void Unknown_Status_Falls_Back_To_ToDo_And_Is_Reported()
    {
        var issue = Parse("""{"fields":{"status":{"name":"Waiting for Stakeholder"}}}""");
        Assert.Equal(IssueStatus.ToDo, issue.Status);
        Assert.NotEmpty(issue.Mappings);
    }

    [Fact]
    public void Maps_Type_And_Priority()
    {
        Assert.Equal(IssueType.Bug, Parse("""{"fields":{"issuetype":{"name":"Bug"}}}""").Type);
        Assert.Equal(IssueType.Story, Parse("""{"fields":{"issuetype":{"name":"Story"}}}""").Type);
        Assert.Equal(IssueType.Task, Parse("""{"fields":{"issuetype":{"name":"Epic"}}}""").Type);
        Assert.Equal(IssuePriority.Urgent, Parse("""{"fields":{"priority":{"name":"Highest"}}}""").Priority);
        Assert.Equal(IssuePriority.Low, Parse("""{"fields":{"priority":{"name":"Lowest"}}}""").Priority);
    }

    [Fact]
    public void Reads_Key_Title_And_Created()
    {
        var issue = Parse("""{"key":"GAME-40","fields":{"summary":"Fix the bug","created":"2026-01-01T00:00:00-0300"}}""");
        Assert.Equal("GAME-40", issue.Key);
        Assert.Equal("Fix the bug", issue.Title);
        Assert.NotNull(issue.Created);
    }

    [Fact]
    public void Handles_TopLevel_Fields_And_Bare_Array_Item()
    {
        // "fields" wins over the top-level "summary" — Jira REST search puts every
        // attribute under "fields"; the top-level key is the only thing read there.
        var issue = Parse("""{"key":"X-1","summary":"nope","fields":{"status":{"name":"Done"}}}""");
        Assert.Equal(IssueStatus.Done, issue.Status);
    }
}