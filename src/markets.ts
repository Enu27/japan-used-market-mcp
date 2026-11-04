/** Markets this server covers: one Apify Actor each, with its own shops and condition grades. */

export interface Market {
    id: 'camera' | 'watch' | 'instrument';
    actorId: string;
    actorUrl: string;
    title: string;
    /** Prefix of Task / Schedule names created by start_monitor. */
    monitorPrefix: string;
    shops: Record<string, string>;
    /** Best to worst. */
    grades: readonly string[];
    gradeNote: string;
    history: string;
    exampleKeywords: string[];
    /** Market-specific listing fields kept by search_listings. */
    slimExtra: (it: any) => Record<string, unknown>;
}

export const MARKETS = {
    camera: {
        id: 'camera',
        actorId: 'keiya_dev~japan-used-camera-market',
        actorUrl: 'https://apify.com/keiya_dev/japan-used-camera-market',
        title: 'Used cameras and lenses',
        monitorPrefix: 'jucm-monitor-',
        shops: {
            fujiya: 'Fujiya Camera (Nakano): full used stock, ~3,500',
            sanpou: 'Sanpou Camera (Jiyugaoka): full used stock, ~1,300',
            naniwa: 'Naniwa / Lemon-sha / Takachiho: new arrivals only, ~200–300',
            hardoff: 'Hard Off Off Mall: cameras and lenses on sale, ~16,000',
        },
        grades: ['NEW', 'A', 'AB+', 'AB', 'AB-', 'B', 'ASIS', 'PARTS'],
        gradeNote: 'NEW > A > AB+ > AB > AB- > B > ASIS (as is) > PARTS',
        history: 'Daily since 2026-11-05 for fujiya, sanpou, naniwa; hardoff weekly (Sundays).',
        exampleKeywords: ['Leica M6', 'Nikon Zf', 'X100VI', 'Voigtlander'],
        slimExtra: (it) => ({ variant: it.variant ?? undefined }),
    },
    watch: {
        id: 'watch',
        actorId: 'keiya_dev~japan-used-watch-market',
        actorUrl: 'https://apify.com/keiya_dev/japan-used-watch-market',
        title: 'Used wristwatches',
        monitorPrefix: 'juwm-monitor-',
        shops: {
            watchnian: 'WATCHNIAN (formerly Ippuukishi): full used stock, ~3,900; search adds box / warranty card',
            offmall: 'Hard Off Off Mall: wristwatches on sale, ~24,000',
        },
        grades: ['NEW', 'UNUSED', 'SA', 'A', 'AB', 'B', 'C', 'JUNK', 'ANTIQUE'],
        gradeNote: 'NEW > UNUSED > SA (like new) > A > AB > B > C > JUNK (not working); ANTIQUE = ungraded antique',
        history: 'Daily since 2026-11-05 for watchnian; offmall weekly (Sundays).',
        exampleKeywords: ['Grand Seiko', 'SBGA211', 'Speedmaster', 'Rolex 16233'],
        slimExtra: (it) => ({ ref: it.ref ?? undefined, gender: it.gender ?? undefined, accessories: it.accessories?.summary ?? undefined }),
    },
    instrument: {
        id: 'instrument',
        actorId: 'keiya_dev~japan-used-instrument-market',
        actorUrl: 'https://apify.com/keiya_dev/japan-used-instrument-market',
        title: 'Used guitars, basses and wind instruments',
        monitorPrefix: 'juim-monitor-',
        shops: {
            shimokura: 'Shimokura Gakki (Ochanomizu / Omiya / Hachioji): full used stock, ~1,400 guitars, basses, wind instruments, effects; not graded',
            offmall: 'Hard Off Off Mall: guitars, basses, woodwinds and brass on sale, ~13,000',
        },
        grades: ['BRAND_NEW', 'MINT', 'EXCELLENT', 'VERY_GOOD', 'GOOD', 'FAIR', 'POOR', 'NON_FUNCTIONING'],
        gradeNote: 'Reverb scale: BRAND_NEW > MINT > EXCELLENT > VERY_GOOD > GOOD > FAIR > POOR > NON_FUNCTIONING (as is / parts); shimokura listings are ungraded',
        history: 'Daily since 2026-11-05 for shimokura; offmall weekly (Sundays).',
        exampleKeywords: ['Fender Japan', 'ST57', 'JB62', 'Tokai', 'Yanagisawa'],
        slimExtra: (it) => ({
            ref: it.ref ?? undefined, type: it.instrumentType ?? undefined, madeIn: it.madeIn ?? undefined,
            year: it.year ?? undefined, era: it.era ?? undefined, case: it.accessories?.summary ?? undefined,
            reverbCondition: it.reverbCondition ?? undefined, store: it.shop ?? undefined,
        }),
    },
} satisfies Record<string, Market>;

export type MarketId = keyof typeof MARKETS;
export const MARKET_IDS = Object.keys(MARKETS) as [MarketId, ...MarketId[]];
export const DEFAULT_MARKET: MarketId = 'camera';

const uniq = (xs: string[]) => [...new Set(xs)];
export const ALL_SHOPS = uniq(Object.values(MARKETS).flatMap((m) => Object.keys(m.shops))) as [string, ...string[]];
export const ALL_GRADES = uniq(Object.values(MARKETS).flatMap((m) => [...m.grades])) as [string, ...string[]];

/** Returns an error message when sources / grades don't belong to the market, else null. */
export function checkMarketArgs(market: Market, args: { sources?: string[]; grades?: string[] }): string | null {
    const problems: string[] = [];
    const badShops = (args.sources ?? []).filter((s) => !(s in market.shops));
    if (badShops.length) problems.push(`${badShops.join(', ')} ${badShops.length > 1 ? 'are not shops' : 'is not a shop'} of the ${market.id} market. Its shops are: ${Object.keys(market.shops).join(', ')}.`);
    const badGrades = (args.grades ?? []).filter((g) => !market.grades.includes(g));
    if (badGrades.length) problems.push(`${badGrades.join(', ')} ${badGrades.length > 1 ? 'are not grades' : 'is not a grade'} of the ${market.id} market. Its grades are: ${market.grades.join(', ')}.`);
    if (!problems.length) return null;
    const other = MARKET_IDS.find((id) => id !== market.id && badShops.length && badShops.every((s) => s in MARKETS[id].shops));
    return problems.join(' ') + (other ? ` Did you mean market: "${other}"?` : ' Call list_markets to see the valid values.');
}
