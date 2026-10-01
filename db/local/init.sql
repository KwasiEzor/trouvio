-- Rôle de Trouvio sur la base Docker locale (ADR 0012), exécuté une fois à l'initialisation du
-- volume. Ni superutilisateur ni droits sur le serveur (COPY … PROGRAM, pg_read_file) : comme le
-- propriétaire du schéma sur Neon, une migration qui exigerait plus échoue dès le poste.
-- Mot de passe jetable : base en boucle locale seulement, aucune donnée réelle.
create role trouvio login password 'trouvio' nosuperuser nocreaterole createdb;
create database trouvio_dev owner trouvio;
