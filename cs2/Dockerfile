FROM cm2network/cs2:latest

COPY --chmod=0755 cs2/pre.sh /etc/pre.sh
COPY --chmod=0755 cs2/entrypoint.sh /home/steam/entrypoint.sh

CMD ["bash", "entrypoint.sh"]
