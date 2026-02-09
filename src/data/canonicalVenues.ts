/**
 * Canonical venue/source list. Used for deduplication, cap per location, and venue filter.
 * Key = stable slug (used in URL and filtering). Name = display name (Source).
 *
 * TODO: Load from Google Sheets (e.g. NEXT_PUBLIC_VENUES_CSV_URL) so venues can be added/edited
 * anytime; scraper can match new events to existing venues from the same sheet.
 */

function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || name.toLowerCase().replace(/\s+/g, '-')
}

export interface CanonicalVenue {
  key: string
  name: string
  handle: string
  sourceType: string
  venueType: string
  eventTypes: string
}

export const CANONICAL_VENUES: CanonicalVenue[] = [
  { key: slug('Lux Frágil'), name: 'Lux Frágil', handle: 'luxfragil', sourceType: 'Both', venueType: 'Club', eventTypes: 'DJs, techno, house' },
  { key: slug('Musicbox Lisboa'), name: 'Musicbox Lisboa', handle: 'musicboxlisboa', sourceType: 'Both', venueType: 'Club / Venue', eventTypes: 'Live music, DJs' },
  { key: slug('Ministerium'), name: 'Ministerium', handle: 'ministeriumclub', sourceType: 'Instagram', venueType: 'Club', eventTypes: 'Techno, electronic' },
  { key: slug('K Urban Beach'), name: 'K Urban Beach', handle: 'k_urban_beach', sourceType: 'Both', venueType: 'Club', eventTypes: 'Mainstream, DJs' },
  { key: slug('Village Underground'), name: 'Village Underground', handle: 'vulisboa', sourceType: 'Both', venueType: 'Cultural venue', eventTypes: 'Concerts, parties' },
  { key: slug('B.Leza'), name: 'B.Leza', handle: 'clube_b.leza', sourceType: 'Both', venueType: 'Club', eventTypes: 'Live music, afro, jazz' },
  { key: slug('Rive Rouge'), name: 'Rive Rouge', handle: 'riverougelx', sourceType: 'Instagram', venueType: 'Club', eventTypes: 'DJs, commercial' },
  { key: slug('Nada Temple'), name: 'Nada Temple', handle: 'nadatemple', sourceType: 'Instagram', venueType: 'Club', eventTypes: 'Techno, underground' },
  { key: slug('Damas'), name: 'Damas', handle: 'damas_lx', sourceType: 'Both', venueType: 'Bar / Venue', eventTypes: 'Live music, DJs' },
  { key: slug('Tokyo Lisboa'), name: 'Tokyo Lisboa', handle: 'tokyolisboa', sourceType: 'Instagram', venueType: 'Club', eventTypes: 'Indie, DJs' },
  { key: slug('Europa Club'), name: 'Europa Club', handle: 'europaclub_lisboa', sourceType: 'Instagram', venueType: 'Club', eventTypes: 'Techno' },
  { key: slug('Casa Independente'), name: 'Casa Independente', handle: 'casaindependente', sourceType: 'Both', venueType: 'Cultural venue', eventTypes: 'Concerts, parties' },
  { key: slug('Roterdão'), name: 'Roterdão', handle: 'roterdaoclub', sourceType: 'Instagram', venueType: 'Club', eventTypes: 'DJs' },
  { key: slug('Lust in Rio'), name: 'Lust in Rio', handle: 'lustinrio.oficial', sourceType: 'Both', venueType: 'Club', eventTypes: 'Mainstream' },
  { key: slug('Harbour Lisbon'), name: 'Harbour Lisbon', handle: 'harbour.lisbon', sourceType: 'Instagram', venueType: 'Club', eventTypes: 'House, techno' },
  { key: slug('Brunch Electronik'), name: 'Brunch Electronik', handle: 'brunchelectronik_lisboa', sourceType: 'Both', venueType: 'Promoter', eventTypes: 'Electronic festivals' },
  { key: slug('Enchufada'), name: 'Enchufada', handle: 'enchufada', sourceType: 'Instagram', venueType: 'Promoter', eventTypes: 'Techno' },
  { key: slug('Fuse Records'), name: 'Fuse Records', handle: 'fuserecords', sourceType: 'Instagram', venueType: 'Promoter', eventTypes: 'Techno' },
  { key: slug('Lisboa Rio'), name: 'Lisboa Rio', handle: 'lisboarionightclub', sourceType: 'Instagram', venueType: 'Club', eventTypes: 'DJs' },
  { key: slug('Clube Ferroviário'), name: 'Clube Ferroviário', handle: 'clubeferroviario', sourceType: 'Instagram', venueType: 'Cultural venue', eventTypes: 'Concerts, DJs' },
  { key: slug('TRAMPS'), name: 'TRAMPS', handle: 'trampslisboa', sourceType: 'Instagram', venueType: 'Club', eventTypes: 'DJs' },
  { key: slug('Quinta do Percevejo'), name: 'Quinta do Percevejo', handle: 'quintadopercevejo', sourceType: 'Instagram', venueType: 'Bar / Venue', eventTypes: 'Live music' },
  { key: slug('Festa BOLHA'), name: 'Festa BOLHA', handle: 'bolhafesta', sourceType: 'Instagram', venueType: 'Promoter', eventTypes: 'Alternative parties' },
  { key: slug('Shotgun Lisbon'), name: 'Shotgun Lisbon', handle: 'shotgun.live', sourceType: 'Website', venueType: 'Ticketing / Aggregator', eventTypes: 'Parties, concerts' },
  { key: slug('TNDM II'), name: 'TNDM II', handle: 'tndmii', sourceType: 'Both', venueType: 'Theatre', eventTypes: 'Theatre' },
  { key: slug('Teatro São Luiz'), name: 'Teatro São Luiz', handle: 'teatrosaoluiz', sourceType: 'Both', venueType: 'Theatre', eventTypes: 'Theatre, dance' },
  { key: slug('TBA'), name: 'TBA', handle: 'tba_lisboa', sourceType: 'Instagram', venueType: 'Theatre', eventTypes: 'Experimental' },
  { key: slug('Trindade'), name: 'Trindade', handle: 'teatrodatrindade', sourceType: 'Instagram', venueType: 'Theatre', eventTypes: 'Theatre' },
  { key: slug('Lisboa Comedy Club'), name: 'Lisboa Comedy Club', handle: 'lisboacomedyclub', sourceType: 'Both', venueType: 'Comedy club', eventTypes: 'Stand-up' },
  { key: slug('Comedy Central PT'), name: 'Comedy Central PT', handle: 'comedycentralpt', sourceType: 'Instagram', venueType: 'Promoter', eventTypes: 'Stand-up' },
  { key: slug('Improv LX'), name: 'Improv LX', handle: 'improvlx', sourceType: 'Instagram', venueType: 'Comedy group', eventTypes: 'Improv' },
  { key: slug('Teatro Maria Matos'), name: 'Teatro Maria Matos', handle: 'teatromariamatos', sourceType: 'Instagram', venueType: 'Theatre', eventTypes: 'Theatre' },
  { key: slug('Plateia d\'Emoções'), name: 'Plateia d\'Emoções', handle: 'plateiademocoes', sourceType: 'Instagram', venueType: 'Promoter', eventTypes: 'Comedy' },
  { key: slug('Cinemateca'), name: 'Cinemateca', handle: 'cinematecaportuguesa', sourceType: 'Both', venueType: 'Cinema', eventTypes: 'Film screenings' },
  { key: slug('Cinema São Jorge'), name: 'Cinema São Jorge', handle: 'cinemasaojorge', sourceType: 'Website', venueType: 'Cinema', eventTypes: 'Film, festivals' },
  { key: slug('Cinema Ideal'), name: 'Cinema Ideal', handle: 'cinemaideal', sourceType: 'Both', venueType: 'Indie cinema', eventTypes: 'Film' },
  { key: slug('Cine Society LX'), name: 'Cine Society LX', handle: 'cinesocietylisboa', sourceType: 'Instagram', venueType: 'Film collective', eventTypes: 'Screenings' },
  { key: slug('IndieLisboa'), name: 'IndieLisboa', handle: 'indielisboa', sourceType: 'Both', venueType: 'Festival', eventTypes: 'Film festival' },
  { key: slug('MAAT'), name: 'MAAT', handle: 'maat_lisboa', sourceType: 'Both', venueType: 'Museum', eventTypes: 'Exhibitions' },
  { key: slug('Gulbenkian'), name: 'Gulbenkian', handle: 'fcgulbenkian', sourceType: 'Both', venueType: 'Cultural centre', eventTypes: 'Music, exhibitions' },
  { key: slug('Culturgest'), name: 'Culturgest', handle: 'culturgest', sourceType: 'Both', venueType: 'Cultural centre', eventTypes: 'Talks, exhibitions' },
  { key: slug('Museu Arte Antiga'), name: 'Museu Arte Antiga', handle: 'mnaa_lisboa', sourceType: 'Instagram', venueType: 'Museum', eventTypes: 'Exhibitions' },
  { key: slug('Museu do Fado'), name: 'Museu do Fado', handle: 'museudofado', sourceType: 'Both', venueType: 'Museum', eventTypes: 'Music, exhibitions' },
  { key: slug('Carpintarias SL'), name: 'Carpintarias SL', handle: 'carpintariasdesaolazaro', sourceType: 'Instagram', venueType: 'Art space', eventTypes: 'Exhibitions' },
  { key: slug('ZDB'), name: 'ZDB', handle: 'galeriazdb', sourceType: 'Both', venueType: 'Gallery', eventTypes: 'Exhibitions, concerts' },
  { key: slug('Underdogs'), name: 'Underdogs', handle: 'underdogsgallery', sourceType: 'Both', venueType: 'Gallery', eventTypes: 'Urban art' },
  { key: slug('Fábrica Braço Prata'), name: 'Fábrica Braço Prata', handle: 'fabricabracodeprata', sourceType: 'Instagram', venueType: 'Cultural venue', eventTypes: 'Talks, concerts' },
  { key: slug('5A Club'), name: '5A Club', handle: '5aclub', sourceType: 'Instagram', venueType: 'Club', eventTypes: 'Techno' },
  { key: slug('Ministerium Terrace'), name: 'Ministerium Terrace', handle: 'ministeriumterrace', sourceType: 'Instagram', venueType: 'Club', eventTypes: 'Techno' },
  { key: slug('Plateau'), name: 'Plateau', handle: 'plateau_lisboa', sourceType: 'Instagram', venueType: 'Club', eventTypes: 'DJs' },
  { key: slug('Incógnito'), name: 'Incógnito', handle: 'incognitolx', sourceType: 'Instagram', venueType: 'Bar', eventTypes: 'DJs' },
  { key: slug('Foxtrot'), name: 'Foxtrot', handle: 'foxtrot_lx', sourceType: 'Instagram', venueType: 'Bar', eventTypes: 'DJs' },
  { key: slug('Purex'), name: 'Purex', handle: 'purexlx', sourceType: 'Instagram', venueType: 'Club', eventTypes: 'Underground' },
  { key: slug('Trumps'), name: 'Trumps', handle: 'trumps_lisboa', sourceType: 'Instagram', venueType: 'Club', eventTypes: 'Queer, pop' },
  { key: slug('Finalmente'), name: 'Finalmente', handle: 'finalmenteclub', sourceType: 'Instagram', venueType: 'Club', eventTypes: 'Drag, pop' },
  { key: slug('Arroz Estúdios'), name: 'Arroz Estúdios', handle: 'arrozestudios', sourceType: 'Instagram', venueType: 'Cultural space', eventTypes: 'Concerts' },
  { key: slug('Anjos70'), name: 'Anjos70', handle: 'anjos70', sourceType: 'Instagram', venueType: 'Cultural venue', eventTypes: 'Concerts' },
  { key: slug('Tokyo Rooftop'), name: 'Tokyo Rooftop', handle: 'tokyorooftop', sourceType: 'Instagram', venueType: 'Bar', eventTypes: 'DJs' },
  { key: slug('Quimera Brewpub'), name: 'Quimera Brewpub', handle: 'quimerabrewpub', sourceType: 'Instagram', venueType: 'Venue', eventTypes: 'Concerts' },
  { key: slug('Mirari'), name: 'Mirari', handle: 'mirari_lx', sourceType: 'Instagram', venueType: 'Venue', eventTypes: 'Electronic' },
  { key: slug('Selina Lisbon'), name: 'Selina Lisbon', handle: 'selinalisbon', sourceType: 'Instagram', venueType: 'Hostel / Venue', eventTypes: 'Parties' },
  { key: slug('LAV'), name: 'LAV', handle: 'lisboaaovivo', sourceType: 'Both', venueType: 'Venue', eventTypes: 'Concerts' },
  { key: slug('RCA Club'), name: 'RCA Club', handle: 'rcaclub', sourceType: 'Instagram', venueType: 'Venue', eventTypes: 'Live music' },
  { key: slug('BOTA'), name: 'BOTA', handle: 'botalx', sourceType: 'Instagram', venueType: 'Bar / Venue', eventTypes: 'Jazz, live' },
  { key: slug('Discrepante'), name: 'Discrepante', handle: 'discrepante', sourceType: 'Instagram', venueType: 'Label / Venue', eventTypes: 'Experimental' },
  { key: slug('Zaratan'), name: 'Zaratan', handle: 'zaratan_arte', sourceType: 'Instagram', venueType: 'Art space', eventTypes: 'Exhibitions' },
  { key: slug('BUS'), name: 'BUS', handle: 'busparagemcultural', sourceType: 'Instagram', venueType: 'Cultural venue', eventTypes: 'Concerts' },
  { key: slug('Casa do Comum'), name: 'Casa do Comum', handle: 'casadocomum', sourceType: 'Instagram', venueType: 'Cultural venue', eventTypes: 'Talks' },
  { key: slug('Sirigaita'), name: 'Sirigaita', handle: 'sirigaitalx', sourceType: 'Instagram', venueType: 'Venue', eventTypes: 'Experimental' },
  { key: slug('Bom Mau Vilão'), name: 'Bom Mau Vilão', handle: 'obomomaueovilao', sourceType: 'Instagram', venueType: 'Bar', eventTypes: 'DJs' },
  { key: slug('Teatro do Vestido'), name: 'Teatro do Vestido', handle: 'teatrodovestido', sourceType: 'Instagram', venueType: 'Theatre', eventTypes: 'Theatre' },
  { key: slug('Teatro Ibérico'), name: 'Teatro Ibérico', handle: 'teatroiberico', sourceType: 'Instagram', venueType: 'Theatre', eventTypes: 'Theatre' },
  { key: slug('Teatro da Garagem'), name: 'Teatro da Garagem', handle: 'teatrodagaragem', sourceType: 'Instagram', venueType: 'Theatre', eventTypes: 'Theatre' },
  { key: slug('Teatro Bocage'), name: 'Teatro Bocage', handle: 'teatrobocage', sourceType: 'Instagram', venueType: 'Theatre', eventTypes: 'Comedy' },
  { key: slug('Comedy Portugal'), name: 'Comedy Portugal', handle: 'comedyportugal', sourceType: 'Instagram', venueType: 'Promoter', eventTypes: 'Stand-up' },
  { key: slug('The Club Lisbon'), name: 'The Club Lisbon', handle: 'theclublisbon', sourceType: 'Instagram', venueType: 'Comedy', eventTypes: 'Stand-up (EN)' },
  { key: slug('Lisbon Players'), name: 'Lisbon Players', handle: 'lisbonplayers', sourceType: 'Instagram', venueType: 'Theatre', eventTypes: 'Theatre (EN)' },
  { key: slug('A Barraca'), name: 'A Barraca', handle: 'abarracateatro', sourceType: 'Instagram', venueType: 'Theatre', eventTypes: 'Theatre' },
  { key: slug('Black Cat Cinema'), name: 'Black Cat Cinema', handle: 'blackcatcinema', sourceType: 'Instagram', venueType: 'Cinema collective', eventTypes: 'Screenings' },
  { key: slug('Shortcutz Lisboa'), name: 'Shortcutz Lisboa', handle: 'shortcutzlisboa', sourceType: 'Instagram', venueType: 'Film event', eventTypes: 'Short films' },
  { key: slug('DocLisboa'), name: 'DocLisboa', handle: 'doclisboa', sourceType: 'Both', venueType: 'Festival', eventTypes: 'Documentary' },
  { key: slug('CCB'), name: 'CCB', handle: 'ccbbelem', sourceType: 'Both', venueType: 'Cultural centre', eventTypes: 'Concerts, exhibitions' },
  { key: slug('BoCA Bienal'), name: 'BoCA Bienal', handle: 'bocabienal', sourceType: 'Instagram', venueType: 'Festival', eventTypes: 'Contemporary art' },
  { key: slug('Appleton'), name: 'Appleton', handle: 'appletonsquare', sourceType: 'Instagram', venueType: 'Gallery', eventTypes: 'Exhibitions' },
  { key: slug('Galeria Fino'), name: 'Galeria Fino', handle: 'franciscofino_gallery', sourceType: 'Instagram', venueType: 'Gallery', eventTypes: 'Exhibitions' },
  { key: slug('Galeria Madragoa'), name: 'Galeria Madragoa', handle: 'galeriamadragoa', sourceType: 'Instagram', venueType: 'Gallery', eventTypes: 'Exhibitions' },
  { key: slug('Kunsthalle'), name: 'Kunsthalle', handle: 'kunsthallelissabon', sourceType: 'Instagram', venueType: 'Gallery', eventTypes: 'Exhibitions' },
  { key: slug('Duplex AIR'), name: 'Duplex AIR', handle: 'duplexair', sourceType: 'Instagram', venueType: 'Art residency', eventTypes: 'Exhibitions' },
  { key: slug('Hangar'), name: 'Hangar', handle: 'hangarlisboa', sourceType: 'Instagram', venueType: 'Art centre', eventTypes: 'Exhibitions' },
  { key: slug('Oficina Cargaleiro'), name: 'Oficina Cargaleiro', handle: 'oamc_lx', sourceType: 'Instagram', venueType: 'Art centre', eventTypes: 'Exhibitions' },
  { key: slug('Cineclube Telheiras'), name: 'Cineclube Telheiras', handle: 'cineclubetelheiras', sourceType: 'Instagram', venueType: 'Film club', eventTypes: 'Screenings' },
  { key: slug('Cinema em Festa'), name: 'Cinema em Festa', handle: 'cinemaemfesta', sourceType: 'Instagram', venueType: 'Film event', eventTypes: 'Screenings' },
  { key: slug('SMUP'), name: 'SMUP', handle: 'smup_parede', sourceType: 'Instagram', venueType: 'Venue', eventTypes: 'Concerts' },
  { key: slug('O Bom O Mau'), name: 'O Bom O Mau', handle: 'obomomaueovilao', sourceType: 'Instagram', venueType: 'Bar', eventTypes: 'DJs' },
  { key: slug('those who dance__'), name: 'those who dance__', handle: 'thosewhodance__', sourceType: 'Instagram', venueType: 'Club', eventTypes: '' },
  { key: slug('musica sem capa'), name: 'musica sem capa', handle: 'musicasemcapa', sourceType: 'Instagram', venueType: 'Aggregator', eventTypes: '' },
  { key: slug('Capsula Melódica'), name: 'Capsula Melódica', handle: 'capsulamelodica.pt', sourceType: 'Instagram', venueType: 'Aggregator', eventTypes: '' },
  { key: slug('1 Tostão'), name: '1 Tostão', handle: 'umtostao_', sourceType: 'Instagram', venueType: 'Aggregator', eventTypes: '' },
  { key: slug('Com Calma'), name: 'Com Calma', handle: 'comcalmaecultura', sourceType: 'Instagram', venueType: 'Cultural venue', eventTypes: '' },
  { key: slug('Teatro da Comuna'), name: 'Teatro da Comuna', handle: 'teatrodacomuna', sourceType: 'Instagram', venueType: 'Cultural venue', eventTypes: '' },
  { key: slug('Vago'), name: 'Vago', handle: 'vago.lisboa', sourceType: 'Instagram', venueType: 'Club', eventTypes: '' },
  { key: slug('Higher Ground'), name: 'Higher Ground', handle: 'highergroundlisboa', sourceType: 'Instagram', venueType: 'Club', eventTypes: '' },
  { key: slug('Disaster'), name: 'Disaster', handle: 'disaster.by.collect', sourceType: 'Instagram', venueType: 'Club', eventTypes: '' },
  { key: slug('Higher Ground Cais'), name: 'Higher Ground Cais', handle: 'collect_caisdosodre', sourceType: 'Instagram', venueType: 'Bar / Venue', eventTypes: '' },
  { key: slug('Musa'), name: 'Musa', handle: 'musademarvila', sourceType: 'Instagram', venueType: 'Bar / Venue', eventTypes: '' },
  { key: slug('Dois corvos'), name: 'Dois corvos', handle: 'doiscorvos.marvila', sourceType: 'Instagram', venueType: 'Bar / Venue', eventTypes: '' },
  { key: slug('Jardins do Bombarda'), name: 'Jardins do Bombarda', handle: 'jardinsdobombarda', sourceType: 'Instagram', venueType: 'Cultural venue', eventTypes: '' },
  { key: slug('Carmo Rooftop'), name: 'Carmo Rooftop', handle: 'carmo_rooftop', sourceType: 'Instagram', venueType: 'Bar / Venue', eventTypes: '' },
  { key: slug('rumu.club'), name: 'rumu.club', handle: 'rumu.club', sourceType: '', venueType: 'Bar / Venue', eventTypes: '' },
  { key: slug('8 marvila'), name: '8 marvila', handle: '8marvila', sourceType: 'Instagram', venueType: 'Club', eventTypes: '' },
  { key: slug('vertice'), name: 'vertice', handle: 'vertice_events', sourceType: 'Instagram', venueType: 'Club', eventTypes: '' },
  { key: slug('Outra Cena'), name: 'Outra Cena', handle: 'outracena_lisboa', sourceType: 'Instagram', venueType: 'Club', eventTypes: '' },
  { key: slug('Cineteatro Turim'), name: 'Cineteatro Turim', handle: 'cineteatroturim', sourceType: 'Instagram', venueType: 'Cinema', eventTypes: '' },
]

export const CANONICAL_VENUE_KEYS = new Set(CANONICAL_VENUES.map((v) => v.key))

/** Get canonical venue by key */
export function getCanonicalVenueByKey(key: string): CanonicalVenue | undefined {
  return CANONICAL_VENUES.find((v) => v.key === key)
}

/** Normalize handle for matching (lowercase, no @) */
export function normalizeHandle(h: string): string {
  return (h || '').trim().toLowerCase().replace(/^@/, '')
}

/** Normalize venue/source name to slug for matching */
export function venueNameToSlug(name: string): string {
  return slug(name || '')
}
