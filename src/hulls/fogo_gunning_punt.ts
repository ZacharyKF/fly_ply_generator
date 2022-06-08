import { abs, cos, pi, sin, tan } from "mathjs";
import { HullShape, PanelSplits } from "../hull_test";
import { RationalBounds } from "../euclidean/rational_bounds";
import { RationalPlane } from "../euclidean/rational_plane";
import { Point3D } from "../euclidean/rational_point";

// Constants
const d2r = pi / 180;

// Overall Values
const length_overall = 258;

// Stern top
const depth_g0 = 10;
const width_g0 = 25.5;

// Stern along
const phi_stern = 33;
const length_sa = 10;
const length_sb = 15;
const length_b0 = 25;
const length_b1 = 40;

// Gunnels
const width_g12 = 37.5;
const length_g1 = 84;
const depth_g1 = 15.5;
const length_g2 = 203.5;
const depth_g2 = 9;

// Sides
const width_s12 = width_g12;//36;
const length_s1 = 96;
const depth_s1 = 31;
const length_s2 = 189;
const depth_s2 = 31;

// Bilge
const phi_b2 = 19.5;
const length_b2 = 12.5;

// Weights
const weights = [
    [1, 1, 1, 1],
    [1.25, 2, 2],
    [1.25],
    [1, 1, 1.55],
];

// Deriving
const vec_stern = new Point3D(
    sin(d2r * phi_stern),
    -cos(d2r * phi_stern),
    0,
    0
);

// Creating our points
const g0 = new Point3D(0, -depth_g0, width_g0, weights[0][0]);

const sa = g0
    .add(vec_stern.mul(length_sa))
    .set_dimm(1, 3)
    .set_dimm(weights[1][0], 3);
const sb = g0
    .add(vec_stern.mul(length_sb))
    .set_dimm(0, 2)
    .set_dimm(weights[2][0], 3);
const b0 = g0
    .add(vec_stern.mul(length_b0))
    .set_dimm(0, 2)
    .set_dimm(weights[3][0], 3);
const b1 = g0
    .add(vec_stern.mul(length_b1))
    .set_dimm(0, 2)
    .set_dimm(weights[3][1], 3);

const g1 = new Point3D(length_g1, -depth_g1, width_g12, weights[0][1]);

const g2 = new Point3D(length_g2, -depth_g2, width_g12, 1 * weights[0][2]);

const g3 = new Point3D(length_overall, 0, 0, 0.25 * weights[0][3]);

const s1 = new Point3D(length_s1, -depth_s1, width_s12, 0.5 * weights[1][1]);

const s2 = new Point3D(length_s2, -depth_s2, width_s12, 0.5 * weights[1][2]);

const b2 = new Point3D(
    length_overall - sin(d2r * phi_b2) * length_b2,
    -length_b2 / tan(d2r * phi_b2),
    0,
    weights[3][2]
);

// Creating our arrays
const bilge = [b0, b1, b2, g3];
const sides_b = [sb, s1, s2, g3];
const sides_a = [sa, s1, s2, g3];
const gunnels = [g0, g1, g2, g3];

const lee = [bilge, sides_b, sides_a, gunnels];

console.log("\n==== CURVES ====");
lee.forEach((l, i) => {
    console.log("== Curve " + i + " ==");
    l.forEach((p) => console.log("=> ", p.x, p.y, p.z, p.w));
});

// Find our mininum value point
const bounds = new RationalBounds(g0);
lee.forEach((l) => l.forEach((p) => bounds.consume(p)));
const y_offset = bounds.max.y - bounds.min.y;
lee.forEach((l) => {
    for (let i = 0; i < l.length; i++) {
        l[i] = l[i].set_dimm(l[i].y + y_offset, 1);
    }
});

const wind = lee.map((l) =>
    l.map((p) => {
        const z = -p.z;
        return p.set_dimm(z, 2);
    })
);

const transom = true;
const bulk_heads: RationalPlane[] = [
    {
        origin: new Point3D(length_overall / 3, 0, 0, 0),
        direction: Point3D.X,
    },
    {
        origin: new Point3D(length_overall - length_overall / 3, 0, 0, 0),
        direction: Point3D.X,
    },
];
let waterlines: number[] = [10, 15];
let panels: PanelSplits[] = [
    { t: 4/5, n: 2 },
    { t: 4/6, n: 3 },
    { t: 4/7, n: 4 },
    { t: 4/8, n: 5 },
    { t: 4/9, n: 6 },
];

export function get_fogo_island_gunning_punt(): HullShape {
    return {
        transom,
        bulk_heads,
        waterlines,
        wind,
        lee,
        panels,
    };
}
