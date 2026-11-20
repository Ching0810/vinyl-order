import { availabilityOf } from '../src/catalog/availability';
import { normalizeName, readListingTitle, splitArtistNames } from '../src/catalog/listing-title';

/**
 * Reading the shops' own names for records (docs/design/tracker.md §6.2):
 * artist, title, format, edition, flags and the expected date. The titles
 * are the shops' public catalog names, as their sitemaps list them
 * (2026-11).
 *
 * Pure functions, no app: kept as an e2e spec only because CI runs those.
 */

const TODAY = '2026-11-19';
const read = (title: string) => readListingTitle(title, TODAY);

describe('Reading listing titles (e2e)', () => {
  describe('THT: Artist - Title FORMAT edition (date note)', () => {
    it('a plain record', () => {
      expect(read('山本剛 - Daahoud LP')).toEqual({
        artist: '山本剛',
        title: 'Daahoud',
        format: 'LP',
        edition: null,
        isVinyl: true,
        isUsed: false,
        isPreOrder: false,
        expected: null,
      });
    });

    it('a colour edition after the format, and a release day', () => {
      expect(
        read('Grey October Sound - Late Night Lo-Fi LP 藍色彩膠 (2027/2/17發行預訂）'),
      ).toMatchObject({
        artist: 'Grey October Sound',
        title: 'Late Night Lo-Fi',
        format: 'LP',
        edition: '藍色彩膠',
        isPreOrder: true,
        expected: { at: '2027-02-17', note: '2027/2/17發行預訂' },
      });
    });

    it('"2 LP" with a space is 2LP', () => {
      expect(read('Grey October Sound - Late Night Lo-Fi 2 LP (2027/2/17發行預訂）')).toMatchObject(
        {
          title: 'Late Night Lo-Fi',
          format: '2LP',
        },
      );
    });

    it('a note after the format is its edition', () => {
      expect(read('Kodaline - We Were Only Young LP (tan Vinyl) ')).toMatchObject({
        title: 'We Were Only Young',
        format: 'LP',
        edition: 'tan Vinyl',
      });
    });

    it('an en dash, and a dash spaced on one side only', () => {
      expect(read('Donny Hathaway – Live LP')).toMatchObject({
        artist: 'Donny Hathaway',
        title: 'Live',
      });
      expect(
        read('V.A.- Lofi Girl Presents Summer Collection 2026 2LP (12月到貨預訂)'),
      ).toMatchObject({
        artist: 'V.A.',
        title: 'Lofi Girl Presents Summer Collection 2026',
        format: '2LP',
        expected: { at: '2026-12-31', note: '12月到貨預訂' },
      });
    });

    it('a dash inside a name is not the artist split', () => {
      expect(read('Jay-Z - Magna Carta Holy Grail 2LP')).toMatchObject({
        artist: 'Jay-Z',
        title: 'Magna Carta Holy Grail',
      });
    });

    it('"[The Lp]" inside the name stays; only the trailing format goes', () => {
      expect(read('A Cat Called Fritz - Discipline Se7enty 9 [The Lp] LP')).toMatchObject({
        title: 'Discipline Se7enty 9 [The Lp]',
        format: 'LP',
      });
    });
  });

  describe('Cosmic: Artist - Title【edition｜sales talk】（format）', () => {
    it('a colour vinyl, its sales talk dropped', () => {
      expect(
        read(
          '伊吉帕普 Iggy Pop - Lust For Life【藍色彩膠｜〈Lust For Life〉猜火車開場曲】（黑膠唱片 LP）',
        ),
      ).toMatchObject({
        artist: '伊吉帕普 Iggy Pop',
        title: 'Lust For Life',
        format: 'LP',
        edition: '藍色彩膠',
        isVinyl: true,
      });
    });

    it('2LP in the format note', () => {
      expect(
        read(
          '聯合公園 Linkin Park - Unshatter Film Soundtrack【聖保羅現場錄音｜柑橘橘環保混色彩膠】（黑膠唱片 2LP）',
        ),
      ).toMatchObject({
        title: 'Unshatter Film Soundtrack',
        format: '2LP',
        edition: '柑橘橘環保混色彩膠',
      });
    });

    it('a CD is not vinyl, and its pressing is the edition', () => {
      expect(read('Barbara Acklin - I Did It【日盤】（CD）')).toMatchObject({
        artist: 'Barbara Acklin',
        title: 'I Did It',
        format: 'CD',
        edition: '日盤',
        isVinyl: false,
      });
    });

    it('merchandise is not vinyl', () => {
      expect(
        read('SUPER JUNIOR - WE ARE SUPER JUNI-DOLL 【MINI JUNIDOLL KEYRING 角色娃娃吊飾】（MD）'),
      ).toMatchObject({ format: 'MD', isVinyl: false });
    });

    it('no edition, only the format', () => {
      expect(read('pami - out of nowhere （黑膠唱片 LP）')).toMatchObject({
        artist: 'pami',
        title: 'out of nowhere',
        format: 'LP',
        edition: null,
      });
    });
  });

  describe('Rotten Blues: 【format】Artist《Title》', () => {
    it('a Japanese CD, its translated name left out of the title', () => {
      expect(
        read('【日版CD】ヨルシカ Yorushika《だから僕は音楽を辞めた》所以我放棄了音樂'),
      ).toMatchObject({
        artist: 'ヨルシカ Yorushika',
        title: 'だから僕は音楽を辞めた',
        format: 'CD',
        edition: '日版',
        isVinyl: false,
      });
    });

    it('the pressing after the title, a note after ※ left out', () => {
      expect(read('【黑膠】Oasis《Some Might Say》限量7吋透明彩膠EP')).toMatchObject({
        artist: 'Oasis',
        title: 'Some Might Say',
        format: 'EP',
        edition: '限量7吋透明彩膠EP',
        isVinyl: true,
      });
      expect(read('【日版黑膠】宋冬野《安和橋北》高音質45轉雙片膠 ※追加生產預購中')).toMatchObject({
        title: '安和橋北',
        format: 'LP',
        edition: '日版 高音質45轉雙片膠',
        isPreOrder: true,
      });
    });

    it('a record', () => {
      expect(read('【黑膠】Test Artist《Sample Album》')).toMatchObject({
        artist: 'Test Artist',
        title: 'Sample Album',
        format: 'LP',
        edition: null,
        isVinyl: true,
      });
    });
  });

  describe('flags', () => {
    it('used', () => {
      expect(read('【二手黑膠】Test Artist《Sample Album》').isUsed).toBe(true);
      expect(read('Test Artist - Sample Album LP').isUsed).toBe(false);
    });

    it.each([
      ['a calendar', "輝人 WHEE IN - 2027 SEASON'S GREETINGS【A WHEE(IN) SERIES】（年曆）"],
      ['merchandise', 'I-DLE - 韓服娃娃 【分成員】（官方週邊）'],
      ['a magazine', 'GQ 2026 12月號封面人物：SAN 【ATEEZ】（韓國雜誌）'],
      ['a score', '【樂譜】愛繆吉他譜全新 ギター弾き語り あいみょん Songbook'],
      ['a player', '【硬體】Shanling 山靈 EC Smart 隨身CD耳擴一體機播放器 CD播放機'],
      ['a book', '【音樂專書】龍冠志《早操》一本關於唱片行的遊記'],
      ['a Blu-ray, as Rotten Blues writes it', '【日版BD】坂本龍一《opus》'],
      [
        'a Blu-ray, as Cosmic writes it',
        '坂本龍一 Ryuichi Sakamoto - Opus【生前最後的紀錄】 （藍光）',
      ],
    ])('%s is not vinyl', (_case, title) => {
      expect(read(title).isVinyl).toBe(false);
    });

    it('vinyl unless another format is named', () => {
      expect(read('Test Artist - Sample Album')).toMatchObject({ format: null, isVinyl: true });
    });
  });

  describe('the expected date', () => {
    it.each([
      ['a day with its year', 'X - Y LP (2027/4/7發行預訂）', '2027-04-07'],
      ['a month with its year: its last day', 'X - Y LP (2027/3月到貨預訂)', '2027-03-31'],
      ['a month and day this year', 'X - Y 2LP (11/20發行預訂）', '2026-11-20'],
      ['a month and day already past: next year', 'X - Y LP (10/23發行預訂）', '2027-10-23'],
      ['a month this year', 'X - Y LP (12月補貨預訂）', '2026-12-31'],
      ['this month', 'X - Y LP (11月到貨預訂）', '2026-11-30'],
      ['a month already past: next year', 'X - Y LP (1月補貨預訂)', '2027-01-31'],
      ['本月', 'X - Y LP (本月補貨預訂)', '2026-11-30'],
      ['the end of a month', 'X - Y LP (12月底到貨預訂)', '2026-12-31'],
      ['February in a leap year', 'X - Y LP (2028/2月發行預訂)', '2028-02-29'],
    ])('%s', (_case, title, at) => {
      expect(read(title).expected?.at).toBe(at);
    });

    it('a note that is not a date stays in the title', () => {
      expect(read('John Mayer - Continuum 2LP (Repackage Bonus Track)')).toMatchObject({
        title: 'Continuum',
        edition: 'Repackage Bonus Track',
        expected: null,
      });
    });

    it('a span of years is not a date', () => {
      expect(read('One OK Rock - A Decade Of Greatest Hits (2015-2025)').expected).toBeNull();
    });

    it('a day no calendar has is no date', () => {
      expect(read('X - Y LP (2027/2/30發行預訂)').expected).toBeNull();
    });
  });

  describe('artist names', () => {
    it.each([
      ['坂本龍一 Ryuichi Sakamoto', ['坂本龍一', 'Ryuichi Sakamoto']],
      ['伊吉帕普 Iggy Pop', ['伊吉帕普', 'Iggy Pop']],
      ['ヨルシカ Yorushika', ['ヨルシカ', 'Yorushika']],
      ['MC HotDog 熱狗', ['MC HotDog', '熱狗']],
      [
        'ゲシュタルト乙女 格式塔少女 Gestalt Girl',
        ['ゲシュタルト乙女', '格式塔少女', 'Gestalt Girl'],
      ],
      ['米津玄師/Kenshi Yonezu', ['米津玄師', 'Kenshi Yonezu']],
      ['JENNIE 제니', ['JENNIE', '제니']],
      ['Barbara Acklin', ['Barbara Acklin']],
      ['V.A.', ['V.A.']],
      ['Jay-Z', ['Jay-Z']],
    ])('%s', (artist, names) => {
      expect(splitArtistNames(artist)).toEqual(names);
    });

    it('normalises full width, case, punctuation and spaces alike', () => {
      expect(normalizeName('ＲＹＵＩＣＨＩ　ＳＡＫＡＭＯＴＯ')).toBe('ryuichisakamoto');
      expect(normalizeName('Ryuichi Sakamoto')).toBe('ryuichisakamoto');
      expect(normalizeName('V.A.')).toBe('va');
      expect(normalizeName('坂本龍一')).toBe('坂本龍一');
    });
  });

  describe('availability', () => {
    it.each([
      [{ available: true, preOrder: false }, 'in_stock'],
      [{ available: true, preOrder: true }, 'pre_order'],
      [{ available: false, preOrder: false }, 'sold_out'],
      [{ available: false, preOrder: true }, 'sold_out'],
    ] as const)('%o is %s', (facts, availability) => {
      expect(availabilityOf(facts)).toBe(availability);
    });
  });
});
