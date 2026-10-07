/* Channel number to 3GPP band (same table as diag_bridge's copy). */
#include <stddef.h>
#include <stdint.h>

#include "bands.h"

/* NR-ARFCN → 3GPP NR band (TS 38.104 table 5.4.2.3-1 FDD + TDD).
   Returns 0 if unknown. */
uint16_t nrarfcn_to_band(uint32_t arfcn) {
    /* Ordered by commercial deployment frequency: most commonly used bands
       first so that overlapping ARFCN ranges pick the operator-typical one. */
    struct { uint32_t lo, hi; uint16_t band; } r[] = {
        {  620000,  653333,  78}, {  693334,  733333,  79}, {  499200,  537999,  41},
        {  422000,  434000,   1}, {  361000,  376000,   3}, {  524000,  538000,   7},
        {  158200,  164200,  20}, {  422000,  440000,  66}, {  386000,  398000,   2},
        {  386000,  399000,  25}, {  173800,  178800,   5}, {  185000,  192000,   8},
        {  620000,  680000,  77}, {  145800,  149200,  12}, {  151600,  153600,  13},
        {  172000,  175000,  14}, {  171800,  178800,  26}, {  151600,  160600,  28},
        {  399000,  404000,  38}, {  378000,  384000,  39}, {  460000,  480000,  40},
        {  620000,  680000,  48},
    };
    for (size_t i = 0; i < sizeof(r)/sizeof(r[0]); i++)
        if (arfcn >= r[i].lo && arfcn <= r[i].hi) return r[i].band;
    return 0;
}

/* EARFCN → LTE band (3GPP TS 36.101 table 5.7.3-1). Covers FDD only for now;
   most common bands used in Europe/NA. Returns 0 if unknown. */
uint16_t earfcn_to_band(uint32_t earfcn) {
    struct { uint32_t lo, hi; uint16_t band; } ranges[] = {
        {     0,    599,  1}, {   600,   1199,  2}, {  1200,   1949,  3},
        {  1950,   2399,  4}, {  2400,   2649,  5}, {  2650,   2749,  6},
        {  2750,   3449,  7}, {  3450,   3799,  8}, {  3800,   4149,  9},
        {  4150,   4749, 10}, {  4750,   4949, 11}, {  5010,   5179, 12},
        {  5180,   5279, 13}, {  5280,   5379, 14}, {  5730,   5849, 17},
        {  5850,   5999, 18}, {  6000,   6149, 19}, {  6150,   6449, 20},
        {  6450,   6599, 21}, {  6600,   7399, 22}, {  7500,   7699, 23},
        {  7700,   8039, 24}, {  8040,   8689, 25}, {  8690,   9039, 26},
        {  9040,   9209, 27}, {  9210,   9659, 28}, {  9660,   9769, 29},
        {  9770,   9869, 30}, {  9870,   9919, 31}, { 36000,  36199, 33},
        { 36200,  36349, 34}, { 36350,  36949, 35}, { 36950,  37549, 36},
        { 37550,  37749, 37}, { 37750,  38249, 38}, { 38250,  38649, 39},
        { 38650,  39649, 40}, { 39650,  41589, 41}, { 41590,  43589, 42},
        { 43590,  45589, 43}, { 45590,  46589, 44},
    };
    for (size_t i = 0; i < sizeof(ranges)/sizeof(ranges[0]); i++)
        if (earfcn >= ranges[i].lo && earfcn <= ranges[i].hi) return ranges[i].band;
    return 0;
}
