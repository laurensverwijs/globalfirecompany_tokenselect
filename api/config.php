<?php
/* Instellingen voor de orderopslag. Pas dit bestand aan op de server. */
return [
  // Wachtwoord voor admin.html. Zolang dit 'wijzig-mij' is, is het beheer uitgeschakeld.
  'admin_password' => 'wijzig-mij',
  // Veiliger: zet hier een hash in plaats van het wachtwoord zelf. Maak die met
  //   php -r "echo password_hash('jouw-wachtwoord', PASSWORD_DEFAULT);"
  // en plak de uitkomst (begint met $2y$) tussen enkele aanhalingstekens.

  // Mogen klanten zelf een nieuwe bestelling starten? false = alleen GFC maakt orders aan in admin.html
  // en stuurt de klant de link.
  'public_create' => false,

  // Wie krijgt een e-mail zodra een klant akkoord geeft? Leeg = geen e-mail.
  // Eén taal voor iedereen (zie mail_lang):   'notify_email' => 'a@voorbeeld.com, b@voorbeeld.nl',
  // Of per adres een eigen taal ('de', 'en' of 'nl'):
  //   'notify_email' => [
  //     'a@voorbeeld.com' => 'de',
  //     'b@voorbeeld.nl' => 'nl',
  //   ],
  'notify_email' => '',
  // Standaardtaal van die e-mail: 'de', 'en' of 'nl'.
  'mail_lang' => 'de',
  // Afzender van die e-mail (gebruik een adres op het eigen domein, anders komt hij vaak in spam).
  'mail_from' => 'no-reply@global-fire-company.com',
  // Adres van de app, voor de links in de akkoord-mail naar het beheer. Vul dit altijd in met het
  // echte adres; laat je het leeg, dan staan er geen links in de mail (dat is veiliger dan een adres
  // dat uit het verzoek wordt afgeleid, want dat kan vervalst worden). Pas dit aan als de app verhuist.
  'app_url' => 'https://scenariogaming.com/global-fire-company/tokensheet',

  // Maximaal aantal nieuwe bestellingen per IP-adres per uur (tegen misbruik).
  'create_limit_per_hour' => 20,
  // Maximaal aantal foute inlogpogingen in het beheer per IP-adres per uur; daarna een uur geblokkeerd.
  'login_attempts_per_hour' => 10,

  // Orders die zo veel maanden niet zijn gewijzigd, worden automatisch verwijderd (AVG). 0 = nooit.
  'retention_months' => 6,

  // Sleutel voor de versleutelde klantgegevens. Leeg = automatisch aangemaakt in api/secret-key.php.
  // Maak van die sleutel een back-up: zonder sleutel zijn de klantgegevens niet meer te lezen.
  'data_key' => '',
];
