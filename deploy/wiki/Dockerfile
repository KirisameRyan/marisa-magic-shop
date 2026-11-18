FROM mediawiki:1.43

ADD --checksum=sha256:23a3ccc5b7ff97b0b8b626d1d9b7e3c648863e49b4c51c18a875dcc4a96917d4 https://codeload.github.com/StarCitizenTools/mediawiki-skins-Citizen/tar.gz/refs/tags/v3.23.0 /tmp/citizen.tar.gz
RUN mkdir /var/www/html/skins/Citizen \
    && tar -xzf /tmp/citizen.tar.gz --strip-components=1 --no-same-owner -C /var/www/html/skins/Citizen \
    && rm /tmp/citizen.tar.gz
