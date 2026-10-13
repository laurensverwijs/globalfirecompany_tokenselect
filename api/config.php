<?php
/* Instellingen voor de orderopslag. Pas dit bestand aan op de server. */
return [
  // Wachtwoord voor admin.html. Zolang dit 'wijzig-mij' is, is het beheer uitgeschakeld.
  'admin_password' => 'wijzig-mij',

  // Mogen klanten zelf een nieuwe bestelling starten? false = alleen GFC maakt orders aan in admin.html
  // en stuurt de klant de link.
  'public_create' => false,

  // Wie krijgt een e-mail zodra een klant akkoord geeft? Eén adres, of meerdere gescheiden door komma's,
  // bijv. 'daniel@voorbeeld.com, laurens@voorbeeld.nl'. Leeg = geen e-mail.
  'notify_email' => '',
  // Taal van die e-mail: 'de', 'en' of 'nl'.
  'mail_lang' => 'de',
  // Afzender van die e-mail (gebruik een adres op het eigen domein, anders komt hij vaak in spam).
  'mail_from' => 'no-reply@global-fire-company.com',
  // Adres van de app, voor de links in de e-mail. Leeg = automatisch (het adres waarop de app draait).
  'app_url' => '',

  // Maximaal aantal nieuwe bestellingen per IP-adres per uur (tegen misbruik).
  'create_limit_per_hour' => 20,
];
