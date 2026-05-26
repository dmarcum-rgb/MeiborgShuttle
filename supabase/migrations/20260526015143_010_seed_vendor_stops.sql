/*
  # Seed vendor_stops with all active route locations

  Inserts all 33 vendor/stop locations that are hardcoded in the driver app
  into the vendor_stops table so they appear in the Stops management tab
  and can be managed from the office.

  Each row includes:
    - name: vendor display name
    - address: full street address (combined with city for some)
    - city: city/state string
    - lat/lng: GPS coordinates for geofence detection (where available)
    - toll_amount: default toll cost for that stop
    - notes: any special instructions (Drop & Hook, paired-stop notes, etc.)
    - active: true for all initial entries
*/

INSERT INTO vendor_stops (name, address, city, lat, lng, toll_amount, notes, active) VALUES
  ('Alliance Ind. (Waupaca)', 'N. 2467 Vaughan Rd', 'Waupaca, WI 54981', 44.3266842, -89.0013343, NULL, '', true),
  ('Bolzoni Auramo Inc.', '17635 Hoffman Way', 'Homewood, IL 60430', 41.5702390, -87.6459885, 84.50, '', true),
  ('BTS 5', '6709 Main St.', 'Union, IL 60180', 42.2307898, -88.5431338, NULL, '', true),
  ('Capital Equip. Kaukauna', '2550 Progress Way', 'Kaukauna, WI 54130', 44.3047952, -88.2591546, NULL, 'w/ Heartland', true),
  ('CCTV', '1111 Rose Rd.', 'Lake Zurich, IL 60047', 42.2010611, -88.0693165, NULL, 'w/ Clipper', true),
  ('Clipper Ind. Inc.', '1520 W. Norwood Ave', 'Itasca, IL 60143', 41.9859581, -88.0410774, 23.30, '', true),
  ('DLS Elect. Systems', '166 South Carter', 'Genoa City, WI 53128', 42.5014586, -88.3256606, NULL, '', true),
  ('Donghua', '493 Mission St.', 'Carol Stream, IL 60188', 41.9256210, -88.1013515, NULL, 'w/ O''Hare', true),
  ('Equipment Depot - Itasca', '751 Expressway Dr.', 'Itasca, IL 60143', 41.9796393, -88.0258205, 23.30, '', true),
  ('Equipment Depot - Heartland', '1100 Cottonwood Ave.', 'Heartland, WI 53029', 43.0828485, -88.3509866, NULL, '', true),
  ('Equipment Depot - Rockford', '4414 11th Street', 'Rockford, IL 61109', 42.2127933, -89.0723229, NULL, '', true),
  ('Fairchild Ind.', '475 Capital Drive', 'Lake Zurich, IL 60047', 42.2064137, -88.0650475, NULL, '', true),
  ('Friedman (Flatbed)', '4303 Kenedy Ave.', 'East Chicago, IN 46312', 41.6386198, -87.4616017, 115.95, '', true),
  ('Grammer', 'Meiborg/Opps. LOAD', '', NULL, NULL, NULL, '', true),
  ('Kapco Inc. (3am from Rockford)', '1150 Cheyenne Ave.', 'Grafton, WI 53024', 43.3193221, -87.9350483, 19.35, 'Drop & Hook', true),
  ('Kuriyama Of America Inc.', '14200 Commerce Court', 'Huntley, IL 60142', 42.1243796, -88.4262014, 6.40, '', true),
  ('L.J. Fab.', '944 Research Pkwy.', 'Rockford, IL 61109', 42.2183322, -89.0830221, NULL, '', true),
  ('Leading Americas', '130 Arrowhead Dr.', 'Hampshire, IL 60410', 42.1487165, -88.5084026, NULL, '', true),
  ('Leibovich', '305 Peoples Ave.', 'Rockford, IL 61104', 42.2413258, -89.0899886, 33.90, 'Drop & Hook', true),
  ('Liftek', 'Meiborg/Opps. LOAD', '', NULL, NULL, NULL, '', true),
  ('Loginext, MLA, C.L.', '340 Commerce Dr. Unit A', 'Crystal Lake, IL 60014', 42.2496403, -88.3297300, NULL, '', true),
  ('MAHLE Rockford', '4814 American Rd.', 'Rockford, IL 61109', 42.2296901, -89.0223648, NULL, '', true),
  ('Meiborg Belvedere WH', '795 Landmark Dr.', 'Belvedere, IL 61008', 42.2524515, -88.8931015, NULL, '', true),
  ('Michellin - OEM (Camso)', '24601 S. Bradley St', 'Channahon, IL 60410', 41.4441171, -88.1949385, 67.60, '', true),
  ('Milama', 'Meiborg/Opps. LOAD', '', NULL, NULL, NULL, '', true),
  ('Misa/Miyama', 'Meiborg/Opps. LOAD', '', NULL, NULL, NULL, '', true),
  ('New Age', '2120 N. West St.', 'River Grove, IL 60171', 41.9183795, -87.8501759, 23.30, 'w/ Northfield', true),
  ('Northfield Ind. LLC (980)', '980 Lunt Ave.', 'Elk Grove Village, IL 60007', 42.0019422, -87.9724457, 23.30, 'w/ New Age', true),
  ('O''Hare Metal Prod. Div', '1098 Touhy Ave.', 'Elk Grove Village, IL 60007', 42.0076960, -87.9706280, 23.30, '', true),
  ('PHC', 'Meiborg/Opps. LOAD', '', NULL, NULL, NULL, '', true),
  ('PMW, Shhhhhh', '1005 McKinley Ave.', 'Belvidere, IL 61008', 42.2705504, -88.8414257, NULL, '', true),
  ('Timber Creek (Wedges)', '128 Badger St.', 'Walworth, WI 53184', 42.5381975, -88.5982851, NULL, '', true),
  ('UCA Marengo', '240 N. Prospect Ave.', 'Marengo, IL 60152', 42.2501490, -88.6081303, NULL, '', true),
  ('Value Added', '1595 Northrock Ct.', 'Rockford, IL 61103', 42.3351396, -89.0700624, NULL, '', true)
ON CONFLICT DO NOTHING;
