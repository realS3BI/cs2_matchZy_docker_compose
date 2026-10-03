FROM mcr.microsoft.com/dotnet/sdk:10.0 AS nades-builder
WORKDIR /src/MatchZyNades
COPY nades-plugin/MatchZyNades/MatchZyNades.csproj ./
RUN dotnet restore MatchZyNades.csproj
COPY nades-plugin/MatchZyNades/*.cs ./
RUN dotnet publish MatchZyNades.csproj --no-restore --configuration Release --output /nades

FROM nades-builder AS nades-tests
WORKDIR /src/MatchZyNades.Tests
COPY nades-plugin/MatchZyNades.Tests/MatchZyNades.Tests.csproj ./
RUN dotnet restore MatchZyNades.Tests.csproj
COPY nades-plugin/MatchZyNades.Tests/*.cs ./
RUN dotnet test MatchZyNades.Tests.csproj --no-restore --configuration Release

FROM cm2network/cs2:latest

COPY --chmod=0755 cs2/pre.sh /etc/pre.sh
COPY --chmod=0755 cs2/entrypoint.sh /home/steam/entrypoint.sh
COPY --from=nades-tests /nades/MatchZyNades.dll /opt/matchzy-nades/MatchZyNades.dll
COPY nades-plugin/gamedata/playbook-nades.json /opt/matchzy-nades/playbook-nades.json

CMD ["bash", "entrypoint.sh"]
