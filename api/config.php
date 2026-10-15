<?php
/* Instellingen voor de orderopslag. Pas dit bestand aan op de server. */
return [
  // Wachtwoord voor admin.html. Zolang dit 'wijzig-mij' is, is het beheer uitgeschakeld.
  'admin_password' => 'wijzig-mij',

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
  // Adres van de app, voor de links in de e-mail. Leeg = automatisch (het adres waarop de app draait).
  'app_url' => '',

  // Maximaal aantal nieuwe bestellingen per IP-adres per uur (tegen misbruik).
  'create_limit_per_hour' => 20,
];
