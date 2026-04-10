FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build

WORKDIR /src

COPY services/notification-service/NotificationService/NotificationService.csproj services/notification-service/NotificationService/
RUN dotnet restore services/notification-service/NotificationService/NotificationService.csproj

COPY services/notification-service/NotificationService services/notification-service/NotificationService

RUN dotnet publish services/notification-service/NotificationService/NotificationService.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/runtime:8.0 AS runtime

WORKDIR /app

COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "NotificationService.dll"]

