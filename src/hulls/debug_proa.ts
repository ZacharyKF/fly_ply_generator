import { pi, tan } from "mathjs";
import { HullShape, PanelSplits } from "../hull_test";
import { RationalPlane } from "../euclidean/rational_plane";
import { Point3D } from "../euclidean/rational_point";

// Measurements for Aka, all in feet, degrees, or unitless
let hull_length = 17;
let hull_ratio = 1.0 / 9;
let hull_width = hull_length * hull_ratio;
let bow_rake = -15;
let asymmetry_wind = 4 / 7;
let gunnel_jump = 7.5 / 14;
let horizontal_flat = 4 / 5;
let vertical_flat = 3 / 5;
let lee_cut_depth = 3 / 5;
let lee_cut_width = 2 / 5;
let hull_depth = 2.25;
let gunnel_rise = 0.5;

// Derived
let rake_rad = (bow_rake * pi) / 180.0;
let hull_length_half = hull_length / 2.0;
let asymmetry_lee = asymmetry_wind - 1.0;
lee_cut_width = lee_cut_width * asymmetry_lee;

let weights: number[][] = [
    [1, 2.25, 1], // bilge curve
    [1, 1], // lee special
    [1, 1], // side default
    [1, 1, 1, 1], // gunnel
];

let bulk_heads: RationalPlane[] = [
    {
        origin: new Point3D(2.0, 0, 0, 0),
        direction: new Point3D(-2, -1, 0, 1).as_unit(),
    },
    {
        origin: new Point3D(6.0, 0, 0, 0),
        direction: new Point3D(2, -1, 0, 1).as_unit(),
    },
];

let waterlines: number[] = [1, 1.25, 1.5, 1.75, 2];

let meeting_point = new Point3D(
    hull_length_half + gunnel_rise * tan(rake_rad),
    hull_depth + gunnel_rise,
    0.0,
    weights[0][2]
);

// ADD FROM BOTTOM TO TOP
let lee_curves: Point3D[][] = [];
let wind_curves: Point3D[][] = [];

// Pull towards the bow to increase waterline
let bilge_curve: Point3D[] = [
    new Point3D(0, 0, 0, weights[0][0]),
    new Point3D(
        hull_length_half + hull_depth * tan((bow_rake * pi) / 180.0),
        0,
        0,
        weights[0][1]
    ),
    meeting_point,
];
lee_curves.push(bilge_curve);
wind_curves.push(bilge_curve);

// This special curve causes the inversion on the lee-side, increasing the
//  hydrofoil effect, while reducing the initial buoyancy, enabling waterline
//  consistency between loads
let special_curve_lee: Point3D[] = [
    new Point3D(
        0,
        hull_depth - hull_depth * lee_cut_depth,
        lee_cut_width,
        weights[1][0]
    ),
    new Point3D(
        hull_length_half * horizontal_flat,
        hull_depth - hull_depth * lee_cut_depth,
        lee_cut_width,
        weights[1][1]
    ),
    meeting_point,
];
lee_curves.push(special_curve_lee);

// Side curves are a simple curve along the side to help control the
//  "pointy-ness" of the hull
let side_default: Point3D[] = [
    new Point3D(
        0.0,
        hull_depth - hull_depth * vertical_flat,
        hull_width,
        weights[2][0]
    ),
    new Point3D(
        hull_length_half * horizontal_flat,
        hull_depth - hull_depth * vertical_flat,
        hull_width,
        weights[2][1]
    ),
    meeting_point,
];
lee_curves.push(side_default.map((p) => p.mul_dimm(asymmetry_lee, 2)));
wind_curves.push(side_default.map((p) => p.mul_dimm(asymmetry_wind, 2)));

// Gunnel curves get added last, they need to be converted like the side curves
let gunnel_default: Point3D[] = [
    new Point3D(0, hull_depth, hull_width, weights[3][0]),
    new Point3D(
        gunnel_jump * hull_length_half,
        hull_depth,
        hull_width,
        weights[3][1]
    ),
    new Point3D(
        gunnel_jump * hull_length_half,
        hull_depth + gunnel_rise,
        hull_width,
        weights[3][2]
    ),
    new Point3D(
        horizontal_flat * hull_length_half,
        hull_depth + gunnel_rise,
        hull_width,
        weights[3][3]
    ),
    meeting_point,
];
lee_curves.push(gunnel_default.map((p) => p.mul_dimm(asymmetry_lee, 2)));
wind_curves.push(gunnel_default.map((p) => p.mul_dimm(asymmetry_wind, 2)));
let panels: PanelSplits[] = [
    { t: 6 / 7, n: 2 },
    { t: 5 / 7, n: 3 },
    { t: 4 / 7, n: 4 },
    { t: 3 / 7, n: 5 },
];
export function get_debug_proa(): HullShape {
    return {
        transom: true,
        bulk_heads,
        waterlines,
        wind: wind_curves,
        lee: lee_curves,
        panels,
    };
}
