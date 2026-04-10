using NotificationService.Contracts;
using NotificationService.Domain;
using NotificationService.Infrastructure;

namespace NotificationService.Application;

public sealed class SendNotificationUseCase(
    NotificationRepository notificationRepository,
    RabbitMqPublisher rabbitMqPublisher,
    ILogger<SendNotificationUseCase> logger)
{
    public async Task<Notification> ExecuteAsync(
        PaymentProcessedEvent paymentProcessedEvent,
        int retryCount,
        CancellationToken cancellationToken)
    {
        var existingNotification =
            await notificationRepository.FindByOrderIdAsync(paymentProcessedEvent.OrderId, cancellationToken);

        if (existingNotification is not null)
        {
            logger.LogInformation(
                "Notification already sent for order {OrderId}, returning idempotent result",
                paymentProcessedEvent.OrderId);

            return existingNotification;
        }

        AssertProcessingBehavior(paymentProcessedEvent.ProcessingBehavior, retryCount, paymentProcessedEvent.OrderId);

        var notification = Notification.Create(
            paymentProcessedEvent.OrderId,
            paymentProcessedEvent.PaymentId,
            paymentProcessedEvent.CustomerEmail,
            paymentProcessedEvent.ProcessingBehavior);

        await notificationRepository.SaveAsync(notification, cancellationToken);
        await rabbitMqPublisher.PublishNotificationSentAsync(notification, cancellationToken);

        logger.LogInformation(
            "Notification sent for order {OrderId}",
            paymentProcessedEvent.OrderId);

        return notification;
    }

    private static void AssertProcessingBehavior(string behavior, int retryCount, Guid orderId)
    {
        if (behavior == ProcessingBehaviors.NotificationPermanent)
        {
            throw new InvalidOperationException(
                $"Permanent notification failure configured for order {orderId}");
        }

        if (behavior == ProcessingBehaviors.NotificationTransient && retryCount < 2)
        {
            throw new InvalidOperationException(
                $"Transient notification failure configured for order {orderId} on retry {retryCount}");
        }
    }
}

