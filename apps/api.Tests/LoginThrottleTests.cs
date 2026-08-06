using Microsoft.Extensions.Logging.Abstractions;
using Trazer.Api.Services;

namespace Trazer.Api.Tests;

public class LoginThrottleTests
{
    private static LoginThrottle New() => new(NullLogger<LoginThrottle>.Instance);

    [Fact]
    public void Allows_Up_To_Five_Attempts_Per_Window()
    {
        var t = New();
        for (int i = 0; i < 5; i++)
            Assert.Equal(0, t.Check("1.2.3.4"));
    }

    [Fact]
    public void Sixth_Attempt_Returns_Retry_After()
    {
        var t = New();
        for (int i = 0; i < 5; i++) t.Check("1.2.3.4");
        Assert.True(t.Check("1.2.3.4") > 0);
    }

    [Fact]
    public void Lockout_Is_Per_IP()
    {
        var t = New();
        for (int i = 0; i < 6; i++) t.Check("1.2.3.4");
        Assert.Equal(0, t.Check("5.6.7.8"));
    }

    [Fact]
    public void Failure_Grows_Backoff_Repeatedly()
    {
        var t = New();
        var first = t.ReportFailure("9.9.9.9");
        var second = t.ReportFailure("9.9.9.9");
        Assert.True(second > first, $"expected second ({second}) to exceed first ({first})");
    }

    [Fact]
    public void Success_Clears_State()
    {
        var t = New();
        t.ReportFailure("1.1.1.1");
        t.ReportSuccess("1.1.1.1");
        Assert.True(t.Check("1.1.1.1") == 0 || t.Check("1.1.1.1") == 0);
        // Failure state cleared: no longer locked out.
        Assert.False(t.Check("1.1.1.1") > 0);
    }
}