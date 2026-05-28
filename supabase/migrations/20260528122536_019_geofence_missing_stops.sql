/*
  # Add geofence coordinates to stops missing lat/lng

  Updates three vendor stops that had real street addresses but no coordinates.
  Coordinates sourced from OpenStreetMap / Nominatim geocoding.

  - Meiborg Shop, 11th: 3814 11th St, Rockford, IL 61109
  - UCA Plant #2 201: 201 N Prospect St, Marengo, IL 60152
  - UCA Plant #3 (Geodis): 19720 E Grant Hwy, Marengo, IL 60152

  Grammer (24806 State Route 697, Delphos OH) could not be geocoded —
  it is listed as a Meiborg/Opps internal load and has no confirmed address.
*/

UPDATE vendor_stops SET lat = 42.2147725, lng = -89.0720146
  WHERE name = 'Meiborg Shop, 11th';

UPDATE vendor_stops SET lat = 42.2525117, lng = -88.5961920
  WHERE name = 'UCA Plant #2 201';

UPDATE vendor_stops SET lat = 42.2403008, lng = -88.5879921
  WHERE name = 'UCA Plant #3 (Geodis)';
