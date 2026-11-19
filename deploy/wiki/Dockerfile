FROM mediawiki:1.43

RUN --mount=type=bind,source=.,target=/build-context,ro \
    set -eu; \
    if [ -f /build-context/citizen-3.23.0.tar.gz ]; then \
        cp /build-context/citizen-3.23.0.tar.gz /tmp/citizen.tar.gz; \
    else \
        curl --fail --silent --show-error --location --connect-timeout 15 --max-time 120 \
            --output /tmp/citizen.tar.gz \
            https://codeload.github.com/StarCitizenTools/mediawiki-skins-Citizen/tar.gz/refs/tags/v3.23.0; \
    fi; \
    printf '%s  %s\n' 23a3ccc5b7ff97b0b8b626d1d9b7e3c648863e49b4c51c18a875dcc4a96917d4 /tmp/citizen.tar.gz \
        | sha256sum --check --strict; \
    mkdir /var/www/html/skins/Citizen \
    && tar -xzf /tmp/citizen.tar.gz --strip-components=1 --no-same-owner -C /var/www/html/skins/Citizen \
    && rm /tmp/citizen.tar.gz
