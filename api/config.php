<?php
/* Instellingen voor de orderopslag. Pas dit bestand aan op de server. */
return [
  // Wachtwoord voor admin.html. Zolang dit 'wijzig-mij' is, is het beheer uitgeschakeld.
  'admin_password' => 'wijzig-mij',

  // Mogen klanten zelf een nieuwe bestelling starten (zonder link van GFC)?
  'public_create' => true,

  // E-mailadres dat bericht krijgt als een klant een bestelling verstuurt. Leeg = geen e-mail.
  'notify_email' => '',
  // Afzender van die e-mail (gebruik een adres op het eigen domein, anders komt hij vaak in spam).
  'mail_from' => 'no-reply@global-fire-company.com',
  // Volledige adres van de app, voor de link in de e-mail.
  'app_url' => 'https://www.global-fire-company.com/sheet-organizer/',

  // Maximaal aantal nieuwe bestellingen per IP-adres per uur (tegen misbruik).
  'create_limit_per_hour' => 20,
];
