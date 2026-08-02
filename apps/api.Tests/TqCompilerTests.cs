using Trazer.Api.Domain;
using Trazer.Query;

namespace Trazer.Api.Tests;

public class TqCompilerTests
{
    private static Issue MakeIssue(
        string title = "Sample",
        string key = "GAME",
        int number = 1,
        string status = "ToDo",
        string priority = "Medium",
        string type = "Task",
        string? epic = null,
        string? sprint = null,
        string? release = null,
        string[]? labels = null)
    {
        var issue = new Issue
        {
            Title = title,
            Number = number,
            Status = Enum.Parse<IssueStatus>(status),
            Priority = Enum.Parse<IssuePriority>(priority),
            Type = Enum.Parse<IssueType>(type),
            Project = new Project { Key = key },
            Assignee = new User { Name = "Demo User" },
            Reporter = new User { Name = "Demo User" },
            AssigneeId = Guid.Parse("11111111-1111-1111-1111-111111111111"),
            ReporterId = Guid.Parse("11111111-1111-1111-1111-111111111111"),
            Epic = epic is null ? null : new Epic { Name = epic },
            Sprint = sprint is null ? null : new Sprint { Name = sprint },
            Release = release is null ? null : new Release { Name = release },
            EpicId = epic is null ? null : Guid.Parse("22222222-2222-2222-2222-222222222222"),
            SprintId = sprint is null ? null : Guid.Parse("33333333-3333-3333-3333-333333333333"),
            ReleaseId = release is null ? null : Guid.Parse("44444444-4444-4444-4444-444444444444")
        };
        foreach (var label in labels ?? [])
            issue.IssueLabels.Add(new IssueLabel { Label = new Label { Name = label } });
        return issue;
    }

    private static Func<Issue, bool> Compile(string query, Guid? me = null, Func<string, Guid?>? resolve = null)
    {
        var expr = TqParser.Parse(query);
        var compiler = new TqCompiler(
            me ?? Guid.Parse("11111111-1111-1111-1111-111111111111"),
            resolve ?? (_ => Guid.Parse("11111111-1111-1111-1111-111111111111")));
        return compiler.Compile(expr).Compile();
    }

    [Theory]
    [InlineData("status = ToDo", "ToDo", "Task", "Medium", true)]
    [InlineData("status = todo", "ToDo", "Task", "Medium", true)]
    [InlineData("status = QA", "ToDo", "Task", "Medium", false)]
    [InlineData("status != Done", "ToDo", "Task", "Medium", true)]
    [InlineData("priority = high", "ToDo", "Task", "High", true)]
    [InlineData("type = Bug", "ToDo", "Bug", "Medium", true)]
    [InlineData("status = BADVALUE", "ToDo", "Task", "Medium", false)]
    public void Enum_Fields(string query, string issueStatus, string issueType, string issuePriority, bool expected)
    {
        var issue = MakeIssue(status: issueStatus, type: issueType, priority: issuePriority);
        Assert.Equal(expected, Compile(query)(issue));
    }

    [Fact]
    public void Assignee_Me_Matches_Current_User()
    {
        var issue = MakeIssue();
        Assert.True(Compile("assignee = me")(issue));
        Assert.False(Compile("assignee = me", me: Guid.NewGuid())(issue));
    }

    [Fact]
    public void Assignee_ByName_Resolves()
    {
        var issue = MakeIssue();
        var predicate = Compile("assignee = Demo", resolve: name => name == "Demo"
            ? Guid.Parse("11111111-1111-1111-1111-111111111111")
            : null);
        Assert.True(predicate(issue));
    }

    [Fact]
    public void Assignee_Unknown_User_Is_False()
    {
        var issue = MakeIssue();
        Assert.False(Compile("assignee = Ghost", resolve: _ => null)(issue));
    }

    [Fact]
    public void Project_And_Key_Matching()
    {
        Assert.True(Compile("project = GAME")(MakeIssue(key: "GAME")));
        Assert.False(Compile("project = OTHER")(MakeIssue(key: "GAME")));
        Assert.True(Compile("GAME-7")(MakeIssue(key: "GAME", number: 7)));
        Assert.False(Compile("GAME-7")(MakeIssue(key: "GAME", number: 8)));
    }

    [Fact]
    public void And_Or_Semantics()
    {
        var todo = MakeIssue(status: "ToDo", priority: "High");
        Assert.True(Compile("status = ToDo AND priority = High")(todo));
        Assert.False(Compile("status = QA AND priority = High")(todo));
        Assert.True(Compile("status = ToDo OR status = QA")(todo));
    }

    [Fact]
    public void Parentheses_Override_Precedence()
    {
        var done = MakeIssue(status: "Done", priority: "High");
        Assert.True(Compile("(status = Done OR status = QA) AND priority = High")(done));
        Assert.False(Compile("(status = Done OR status = QA) AND priority = Low")(done));
    }

    [Fact]
    public void In_Operator()
    {
        Assert.True(Compile("status in (Done, QA)")(MakeIssue(status: "QA")));
        Assert.False(Compile("status in (Done, QA)")(MakeIssue(status: "ToDo")));
    }

    [Fact]
    public void Label_Fields()
    {
        var issue = MakeIssue(labels: ["frontend", "bug"]);
        Assert.True(Compile("label = frontend")(issue));
        Assert.False(Compile("label = backend")(issue));
        Assert.False(Compile("label != frontend")(issue));
        Assert.True(Compile("label != backend")(issue));
        Assert.True(Compile("label ~ FRONT")(issue));
        Assert.True(Compile("label ~ Bug")(issue));
        Assert.False(Compile("label ~ backend")(issue));
    }

    [Fact]
    public void Ref_Fields()
    {
        var issue = MakeIssue(epic: "UI / UX", sprint: "Sprint 1", release: "v0.1");
        Assert.True(Compile("epic = \"UI / UX\"")(issue));
        Assert.False(Compile("epic = Core")(issue));
        Assert.True(Compile("sprint = \"Sprint 1\"")(issue));
        Assert.True(Compile("release = v0.1")(issue));
    }

    [Fact]
    public void Text_Search()
    {
        var issue = MakeIssue(title: "Drag and drop board");
        Assert.True(Compile("title ~ drag")(issue));
        Assert.True(Compile("title ~ DRAG")(issue));
        Assert.True(Compile("text ~ drop")(issue));
        Assert.False(Compile("title ~ render")(issue));
    }

    [Fact]
    public void Estimate_Field()
    {
        var issue = MakeIssue();
        issue.Estimate = 3;
        Assert.True(Compile("estimate = 3")(issue));
        Assert.False(Compile("estimate = 5")(issue));
        Assert.True(Compile("estimate != 5")(issue));
    }

    [Fact]
    public void NotEqual_On_Nullable_Ref_Excludes_Null()
    {
        var unassigned = MakeIssue();
        unassigned.AssigneeId = null;
        unassigned.Assignee = null;
        var assigned = MakeIssue();
        Assert.False(Compile("assignee != me")(unassigned));
        Assert.True(Compile("assignee != me")(assigned));
    }

    [Fact]
    public void Is_Empty_And_Not_Empty()
    {
        var unassigned = MakeIssue();
        unassigned.AssigneeId = null;
        unassigned.Assignee = null;
        var assigned = MakeIssue();

        Assert.True(Compile("assignee is empty")(unassigned));
        Assert.False(Compile("assignee is empty")(assigned));
        Assert.False(Compile("assignee is not empty")(unassigned));
        Assert.True(Compile("assignee is not empty")(assigned));
    }

    [Fact]
    public void Is_Empty_On_Refs_And_Estimate()
    {
        var bare = MakeIssue();
        Assert.True(Compile("epic is empty")(bare));
        Assert.False(Compile("epic is not empty")(bare));
        Assert.True(Compile("sprint is empty")(bare));
        Assert.True(Compile("release is empty")(bare));
        Assert.True(Compile("estimate is null")(bare));

        var full = MakeIssue(epic: "UI", sprint: "S1", release: "v1");
        full.Estimate = 5;
        Assert.True(Compile("epic is not empty")(full));
        Assert.True(Compile("estimate is not null")(full));
    }

    [Fact]
    public void Description_Is_Empty()
    {
        var issue = MakeIssue();
        Assert.True(Compile("description is empty")(issue));
        issue.Description = "hello";
        Assert.False(Compile("description is empty")(issue));
        Assert.True(Compile("description is not empty")(issue));
    }

    [Fact]
    public void CurrentUser_Function_Matches_Me()
    {
        var issue = MakeIssue();
        Assert.True(Compile("assignee = currentUser()")(issue));
        Assert.False(Compile("assignee = currentUser()", me: Guid.NewGuid())(issue));
    }

    [Fact]
    public void Relative_Date_Comparison()
    {
        var issue = MakeIssue();
        issue.CreatedAt = DateTime.UtcNow.AddDays(-1);
        Assert.True(Compile("created >= -7d")(issue));
        Assert.False(Compile("created < -7d")(issue));

        issue.CreatedAt = DateTime.UtcNow.AddDays(-30);
        Assert.False(Compile("created >= -7d")(issue));
        Assert.True(Compile("created <= -2w")(issue));
    }

    [Fact]
    public void Now_Comparison()
    {
        var issue = MakeIssue();
        issue.UpdatedAt = DateTime.UtcNow.AddHours(-2);
        Assert.True(Compile("updated <= now()")(issue));
        Assert.False(Compile("updated > now()")(issue));
    }

    [Fact]
    public void Estimate_Ordering_Operators()
    {
        var issue = MakeIssue();
        issue.Estimate = 3;
        Assert.True(Compile("estimate > 2")(issue));
        Assert.True(Compile("estimate >= 3")(issue));
        Assert.False(Compile("estimate > 3")(issue));
        Assert.True(Compile("estimate < 4")(issue));
        Assert.False(Compile("estimate < 3")(issue));
        Assert.True(Compile("estimate <= 3")(issue));
    }

    [Fact]
    public void Unknown_Word_Is_Implicit_Text_Search()
    {
        Assert.False(Compile("bogus")(MakeIssue()));
        Assert.True(Compile("sample")(MakeIssue()));
    }
}
