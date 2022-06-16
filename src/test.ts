
import MakerJs, { IModel, IModelMap } from "makerjs";
import { abs, min, mod, pi, tan } from "mathjs";
import { BezierSurfaceHull } from "./hulls/bezier_surface_hull";
import { get_debug_proa } from "./hulls/debug_proa";
import { get_fogo_island_gunning_punt } from "./hulls/fogo_gunning_punt";
import { RationalBounds } from "./euclidean/rational_bounds";
import { RationalPlane } from "./euclidean/rational_plane";
import { Point2D, Point3D } from "./euclidean/rational_point";
import { relay_line } from "./utils/rational_math";
import { color_dark, color_naturally, export_svg, make_arrow, points_to_imodel } from "./utils/makerjs_tools";
import { RationalBezierSurface } from "./curves/rational_bezier_surface";

const draw_arrow = (a: Point2D, b: Point2D): IModel => {
    return make_arrow(0, a, b, pi/8, 0.25); 
};

const divisions = 4;
const levels = 2 ** divisions;

const tri_counts: number[] = [];
tri_counts[0] = 0;
for (let c = 1; c <= levels; c++) {
    tri_counts[c] = tri_counts[c - 1] + c;
}

const triangle: Point2D[] = new Array(tri_counts[tri_counts.length - 1] + levels);
const triangle_levels: Point2D[][] = [];

let last_step = levels + 1;
for(let div = 0; div <= divisions; div++) {
    const i_step = 2 ** (divisions - div);
    const points: Point2D[] = [];
    for(let i = 0; i <= levels; i += i_step) {
        for(let j = 0; j <= i; j += i_step) {
            if(last_step <= levels && i % last_step == 0 && j % last_step == 0) {
                continue;
            }
            const p = new Point2D(i, j, 1);
            triangle[tri_counts[i] + j] = p;
            points.push(p);
        }
    }
    triangle_levels.push(points);
    last_step = i_step;
}

const get_point_tri = (div: number, i: number, j: number): Point2D => {
    const i_step = 2 ** (divisions - div);
    const c = i * i_step;
    const r = j * i_step;
    const idx = tri_counts[c] + r;
    return triangle[idx];
}

const get_neighbors_tri = (div: number, i: number, j: number): Point2D[] => {
    const step = 2 ** (divisions - div);

    const start_i = i == 0 ? i : i - 1;
    const end_i = i == levels ? i : i + 1;

    const start_j = j == 0 ? j : j - 1;

    const results: Point2D[] = [];
    for(let c = start_i; c <= end_i; c++) {
        const end_j = min(j + 1, c);
        for(let r = start_j; r <= end_j; r++) {
            if(c == i && r == j) {
                continue;
            } 
            const p = triangle[tri_counts[c * step] + r * step];
            results.push(p);
        }
    }
    return results;
}

const test_set_tri: {d: number, x: number, y: number}[] = [
    {d: 0, x: 0, y: 0},
    {d: 1, x: 1, y: 1},
    {d: 2, x: 2, y: 1},
    {d: 3, x: 3, y: 2},
    {d: 4, x: 4, y: 3},
];
const tri_models: IModelMap = {};
test_set_tri.forEach((set, s) => {
    const center = get_point_tri(set.d, set.x, set.y);
    const neighbors = get_neighbors_tri(set.d, set.x, set.y);
    neighbors.map(n =>  draw_arrow(center, n)).map(a => {
        return color_naturally(a, s);
    }).forEach((a, i) => {
        tri_models["arrow_" + s + "_" + i] = a;
    })
});

triangle_levels.map((l, i) => {
    return new MakerJs.models.Holes(0.05 * (divisions - i + 1), l.map(p => p.to_ipoint(0)))
}).map(color_dark).forEach((m, i) => {
    tri_models["m_" + i] = m;
})

export_svg("triangle", {models: tri_models});

const square: Point2D[] = new Array((levels + 1) * (levels + 1))
const square_levels: Point2D[][] = [];
last_step = levels + 1;
for(let div = 0; div <= divisions; div++) {
    const i_step = 2 ** (divisions - div);
    const points:Point2D[] = [];
    for(let i = 0; i <= levels; i += i_step) {
        for(let j = 0; j <= levels; j += i_step) {
            if (last_step <= levels && i % last_step == 0 && j % last_step == 0) {
                continue;
            }
            const p = new Point2D(i, j, 1);
            const idx = j * (levels + 1) + i;
            square[idx] = p;
            points.push(p);
        }
    }
    last_step = i_step;
    square_levels.push(points);
}

const get_point_sqr = (div: number, i: number, j: number): Point2D => {
    const step = 2 ** (divisions - div);
    const c = i * step;
    const r = j * step;
    const idx = r * (levels + 1) + c;
    const p = square[idx];
    return p
}

const get_neighbors_sqr = (div: number, i: number, j: number): Point2D[] => {
    const step = 2 ** (divisions - div);
    const max_l = 2 ** div;

    const start_i = i == 0 ? i : i - 1;
    const end_i = i == max_l ? i : i + 1;

    const start_j = j == 0 ? j : j - 1;
    const end_j = j == max_l ? j : j + 1;

    const results: Point2D[] = [];
    for(let c = start_i; c <= end_i; c++) {
        for(let r = start_j; r <= end_j; r++) {
            if (c == i && r == j) {
                continue;
            }
            const col = c * step;
            const row = r * step;
            const idx = row * (levels + 1) + col;
            const p = square[idx];
            results.push(p);
        }
    }

    return results;
};

const sqr_models: IModelMap = {};
square_levels.map((l, i) => {
    return new MakerJs.models.Holes(0.05 * (divisions - i + 1), l.map(p => p.to_ipoint(0)))
}).map(color_dark).forEach((m, i) => {
    sqr_models["m_" + i] = m;
})

const test_set_sqr: {d: number, x: number, y: number}[] = [
    {d: 0, x: 0, y: 0},
    {d: 1, x: 1, y: 1},
    {d: 2, x: 2, y: 2},
    {d: 3, x: 3, y: 3},
    {d: 4, x: 4, y: 4},
];
test_set_sqr.forEach((set, s) => {
    const center = get_point_sqr(set.d, set.x, set.y);
    const neighbors = get_neighbors_sqr(set.d, set.x, set.y);
    neighbors.map(n =>  draw_arrow(center, n)).map(a => {
        return color_naturally(a, s);
    }).forEach((a, i) => {
        sqr_models["arrow_" + s + "_" + i] = a;
    })
});

export_svg("square", {models: sqr_models});