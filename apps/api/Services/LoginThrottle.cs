using System.Collections.Concurrent;

namespace Trazer.Api.Services;

// Per-IP login throttle: max 5 attempts in a 60s window, and on each failed attempt a
// lockout that grows exponentially (60s, 2m, 4m, …) until the client logs in clean.
// In-memory, single-process — right for a single-tenant instance.
// ponytail: no Redis, no sliding-window precision; sufficient for the PRD's 5/min/IP gate.
public class LoginThrottle(ILogger<LoginThrottle> logger)
{
    private const int MaxWindowAttempts = 5;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan BaseBackoff = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan MaxBackoff = TimeSpan.FromHours(1);

    private sealed class State
    {
        public int WindowAttempts;      // attempts in the current window
        public double WindowStartedAt;  // ms epoch (UnixTime), UTC
        public int Failures;            // consecutive failures
        public double LockedUntil;      // ms epoch — 0 = not locked
    }

    private readonly ConcurrentDictionary<string, State> _states = new(StringComparer.OrdinalIgnoreCase);

    // Returns seconds the client must wait, or 0 when the request may proceed.
    public int Check(string ip)
    {
        var state = _states.GetOrAdd(ip, _ => new State());
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        lock (state)
        {
            if (state.LockedUntil > now) return RetrySeconds(now, state.LockedUntil);
            if (now - state.WindowStartedAt >= Window.TotalMilliseconds)
            {
                state.WindowStartedAt = now;
                state.WindowAttempts = 0;
            }
            if (state.WindowAttempts >= MaxWindowAttempts)
            {
                state.LockedUntil = now + Window.TotalMilliseconds;
                state.WindowAttempts = 0;
                return RetrySeconds(now, state.LockedUntil);
            }
            state.WindowAttempts++;
        }
        return 0;
    }

    public int ReportFailure(string ip)
    {
        var state = _states.GetOrAdd(ip, _ => new State());
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        lock (state)
        {
            state.Failures++;
            var backoff = BaseBackoff.TotalMilliseconds * Math.Pow(2, state.Failures - 1);
            var ms = Math.Min(backoff, MaxBackoff.TotalMilliseconds);
            state.LockedUntil = now + ms;
            state.WindowAttempts = 0;
            state.WindowStartedAt = now;
            logger.LogInformation("Login throttle {Ip}: failure {Fails}, locked for {Seconds}s", ip, state.Failures, ms / 1000);
            return RetrySeconds(now, state.LockedUntil);
        }
    }

    public void ReportSuccess(string ip) => _states.TryRemove(ip, out _);

    private static int RetrySeconds(double now, double lockedUntil)
    {
        var secs = (int)Math.Ceiling((lockedUntil - now) / 1000.0);
        return Math.Max(1, secs);
    }
}