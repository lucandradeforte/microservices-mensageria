using System.Threading;

namespace NotificationService.Observability;

public static class CorrelationContext
{
    private static readonly AsyncLocal<string?> CurrentCorrelationId = new();

    public static string GetOrCreate(string? explicitCorrelationId = null)
    {
        return explicitCorrelationId
            ?? CurrentCorrelationId.Value
            ?? Guid.NewGuid().ToString();
    }

    public static IDisposable BeginScope(string correlationId)
    {
        var previous = CurrentCorrelationId.Value;
        CurrentCorrelationId.Value = correlationId;

        return new ScopeReset(() => CurrentCorrelationId.Value = previous);
    }

    private sealed class ScopeReset(Action reset) : IDisposable
    {
        public void Dispose()
        {
            reset();
        }
    }
}

