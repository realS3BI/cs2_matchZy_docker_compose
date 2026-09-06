FROM mcr.microsoft.com/dotnet/sdk:10.0 AS coach-builder

WORKDIR /src/MatchZyCoach
COPY coach-plugin/MatchZyCoach/MatchZyCoach.csproj ./
RUN dotnet restore MatchZyCoach.csproj
COPY coach-plugin/MatchZyCoach/*.cs ./
RUN dotnet publish MatchZyCoach.csproj --no-restore --configuration Release --output /coach

FROM coach-builder AS coach-tests
WORKDIR /src/MatchZyCoach.Tests
COPY coach-plugin/MatchZyCoach.Tests/MatchZyCoach.Tests.csproj ./
RUN dotnet restore MatchZyCoach.Tests.csproj
COPY coach-plugin/MatchZyCoach.Tests/*.cs ./
RUN dotnet test MatchZyCoach.Tests.csproj --no-restore --configuration Release

FROM cm2network/cs2:latest

COPY --chmod=0755 cs2/pre.sh /etc/pre.sh
COPY --chmod=0755 cs2/entrypoint.sh /home/steam/entrypoint.sh
COPY --from=coach-builder /coach/MatchZyCoach.dll /opt/matchzy-coach/MatchZyCoach.dll

CMD ["bash", "entrypoint.sh"]
