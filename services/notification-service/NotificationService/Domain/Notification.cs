namespace NotificationService.Domain;

public sealed class Notification
{
    private Notification(
        Guid id,
        Guid orderId,
        Guid paymentId,
        string customerEmail,
        string channel,
        string status,
        string processingBehavior,
        DateTimeOffset sentAt,
        DateTimeOffset createdAt,
        DateTimeOffset updatedAt)
    {
        Id = id;
        OrderId = orderId;
        PaymentId = paymentId;
        CustomerEmail = customerEmail;
        Channel = channel;
        Status = status;
        ProcessingBehavior = processingBehavior;
        SentAt = sentAt;
        CreatedAt = createdAt;
        UpdatedAt = updatedAt;
    }

    public Guid Id { get; }

    public Guid OrderId { get; }

    public Guid PaymentId { get; }

    public string CustomerEmail { get; }

    public string Channel { get; }

    public string Status { get; }

    public string ProcessingBehavior { get; }

    public DateTimeOffset SentAt { get; }

    public DateTimeOffset CreatedAt { get; }

    public DateTimeOffset UpdatedAt { get; }

    public static Notification Create(
        Guid orderId,
        Guid paymentId,
        string customerEmail,
        string processingBehavior)
    {
        var now = DateTimeOffset.UtcNow;

        return new Notification(
            Guid.NewGuid(),
            orderId,
            paymentId,
            customerEmail,
            "email",
            "SENT",
            processingBehavior,
            now,
            now,
            now);
    }

    public static Notification Restore(
        Guid id,
        Guid orderId,
        Guid paymentId,
        string customerEmail,
        string channel,
        string status,
        string processingBehavior,
        DateTimeOffset sentAt,
        DateTimeOffset createdAt,
        DateTimeOffset updatedAt)
    {
        return new Notification(
            id,
            orderId,
            paymentId,
            customerEmail,
            channel,
            status,
            processingBehavior,
            sentAt,
            createdAt,
            updatedAt);
    }
}

