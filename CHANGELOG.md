# Versies

Het versienummer staat in `VERSION`, in het beheer onderaan de pagina, en in de naam van de zip (`python3 tools/make_zip.py`).

## 1.1.1 (17 oktober 2026)

- Eigen icoontje (favicon) met het GFC-logo in plaats van dat van de website eromheen.

## 1.1.0 (17 oktober 2026)

- Gebruikers met eigen naam en wachtwoord. Rol **Beheerder**: alles. Rol **Gebruiker**: bestellingen aanmaken, bekijken, status wijzigen en PDF downloaden.
- De hoofdbeheerder blijft `admin` met het wachtwoord uit `api/config.php`; die maakt de andere gebruikers aan.
- Wachtwoorden staan als hash in de versleutelde gebruikerslijst; na inloggen gebruikt de browser een sessie van 12 uur in plaats van het wachtwoord.
- Iedere gebruiker kan zijn eigen wachtwoord wijzigen; de beheerder kan gebruikers blokkeren, een nieuw wachtwoord geven of verwijderen.
- Per bestelling wordt bijgehouden wie hem aanmaakte en wie de status wijzigde (Details → Geschiedenis).

## 1.0.2 (17 oktober 2026)

- Knop **Wachtwoord-hash maken** in het beheer: typ een nieuw wachtwoord en je krijgt de regel om in `api/config.php` te plakken.

## 1.0.1 (17 oktober 2026)

- Het beheerwachtwoord in `api/config.php` mag nu een hash zijn (uit `password_hash`), zodat het wachtwoord zelf niet meer leesbaar op de server staat. Een gewoon wachtwoord blijft werken.
- `CLAUDE.md` met vaste afspraken over AVG, versleuteling, beveiliging en versienummers.

## 1.0.0 (17 oktober 2026)

Eerste genummerde versie. Bevat:
- Sheet samensteller in Nederlands, Engels en Duits, met afdrukken en PDF.
- Bestellingen: GFC maakt een order aan in het beheer, de klant vult de sheets via een eigen link, slaat tussendoor op en geeft akkoord.
- E-mail bij akkoord, per adres in een eigen taal, met een knop Testmail sturen in het beheer.
- Beveiliging en AVG: versleutelde klantgegevens, automatisch verwijderen na 6 maanden, blokkade na te veel foute inlogpogingen, HTTPS en beveiligingsheaders, privacytekst bij akkoord.
- Ambulance heet nu Rettungsdienst Type 1, 2 en 3.
