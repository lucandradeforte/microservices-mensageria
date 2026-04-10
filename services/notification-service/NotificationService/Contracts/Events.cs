namespace NotificationService.Contracts;

public static class EventNames
{
    public const string OrderCreated = "order.created";
    public const string PaymentProcessed = "payment.processed";
    public const string NotificationSent = "notification.sent";
}

public static class Exchanges
{
    public const string Events = "domain.events";
    public const string Retry = "domain.retry";
    public const string DeadLetter = "domain.dlx";
}

public static class ProcessingBehaviors
{
    public const string Normal = "normal";
    public const string PaymentTransient = "payment-transient";
    public const string PaymentPermanent = "payment-permanent";
    public const string NotificationTransient = "notification-transient";
    public const string NotificationPermanent = "notification-permanent";
}

public sealed record EventEnvelope<TPayload>(
    string EventName,
    string Version,
    DateTimeOffset OccurredAt,
    string CorrelationId,
    TPayload Payload);

public sealed record PaymentProcessedEvent(
    Guid PaymentId,
    Guid OrderId,
    string CustomerEmail,
    decimal Amount,
    string Currency,
    string Status,
    string ProcessingBehavior,
    DateTimeOffset ProcessedAt);

public sealed record NotificationSentEvent(
    Guid NotificationId,
    Guid OrderId,
    Guid PaymentId,
    string CustomerEmail,
    string Channel,
    string Status,
    string ProcessingBehavior,
    DateTimeOffset SentAt);

