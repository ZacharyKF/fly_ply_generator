import * as fs from "fs";
import MakerJs, { IModel, IModelMap, exporter, IPathMap } from "makerjs";
import { pi, tan } from "mathjs";
import { RationalBezierHull } from "./rational_bezier_hull";
import { Point } from "./rational_point";

export interface FlattenResult {
    lee: IModel;
    wind: IModel;
    lee_panels: IModel[];
    wind_panels: IModel[];
}

export interface DrawableHull {
    draw_main_curves(dimm: number): IModel;
    draw_hull_curves(dimm: number, lee: boolean, wind: boolean): IModel;
    draw_segments(
        dimm: number,
        number_segs: number,
        lee: boolean,
        wind: boolean,
        as_divisions: boolean,
    ): IModel;
    draw_flattened_hull(
        lee: boolean,
        wind: boolean,
        puzzle_tooth_width: number,
        puzzle_tooth_angle: number,
        bulkheads: number[]
    ): FlattenResult;
    draw_bulkhead(dist: number, idx: number): IModel;
    volume_under(dist: number): number;
}

// Drawing parameters
let scale_up = 100;
let slices = 200;
let segments_drawn = 100;
let draw_lee = true;
let draw_wind = true;
let as_divisions = true;

// Hull division parameters
let variance_threshold = 0.003;

// Measurements for Aka, all in feet, degrees, or unitless
let hull_length = 17;
let hull_ratio = 1.0 / 10.0;
let hull_width = hull_length * hull_ratio;
let bow_rake = 5;
let asymmetry_wind = 4 / 7;
let gunnel_jump = 2 / 3;
let horizontal_flat = 5 / 7;
let vertical_flat = 4 / 7;
let lee_cut_depth = 3 / 5;
let lee_cut_width = 2 / 5;
let hull_depth = -2.25;
let gunnel_rise = 0.5;
let curve_colinearity_tolerance = 0.95;
let puzzle_tooth_width = hull_depth / 30;
let puzzle_tooth_angle = (10 * pi) / 180;

// Derived
let rake_rad = (bow_rake * pi) / 180.0;
let hull_length_half = hull_length / 2.0;
let asymmetry_lee = asymmetry_wind - 1.0;
lee_cut_width = lee_cut_width * asymmetry_lee;

let weights: number[][] = [
  [2, 4, 2], // bilge curve
  [2, 4], // lee special
  [2, 3.5], // side default
  [1, 1, 1, 1], // gunnel
];

let bulk_heads: number[] = [
    0.0,
    hull_length_half / 3,
    (2 * hull_length_half) / 3,
];

let waterlines: number[] = [1, 1.45];

let meeting_point = new Point(
    hull_length_half + gunnel_rise * tan(rake_rad),
    gunnel_rise,
    0.0,
    weights[0][2]
);

// ADD FROM BOTTOM TO TOP
let lee_curves: Point[][] = [];
let wind_curves: Point[][] = [];

// Pull towards the bow to increase waterline
let bilge_curve: Point[] = [
    new Point(0.0, hull_depth, 0.0, weights[0][0]),
    new Point(
        hull_length_half + hull_depth * tan((bow_rake * pi) / 180.0),
        hull_depth,
        0.0,
        weights[0][1]
    ),
    meeting_point,
];
lee_curves.push(bilge_curve);
wind_curves.push(bilge_curve);

// This special curve causes the inversion on the lee-side, increasing the
//  hydrofoil effect, while reducing the initial buoyancy, enabling waterline
//  consistency between loads
let special_curve_lee: Point[] = [
    new Point(0.0, hull_depth * lee_cut_depth, lee_cut_width, weights[1][0]),
    new Point(
        hull_length_half * horizontal_flat,
        hull_depth * lee_cut_depth,
        lee_cut_width,
        weights[1][1]
    ),
    meeting_point,
];
lee_curves.push(special_curve_lee);

// Side curves are a simple curve along the side to help control the
//  "pointy-ness" of the hull
let side_default: Point[] = [
    new Point(0.0, hull_depth * vertical_flat, hull_width, weights[2][0]),
    new Point(
        hull_length_half * horizontal_flat,
        hull_depth * vertical_flat,
        hull_width,
        weights[2][1]
    ),
    meeting_point,
];
lee_curves.push(side_default.map((p) => p.mul_dimm(asymmetry_lee, 2)));
wind_curves.push(side_default.map((p) => p.mul_dimm(asymmetry_wind, 2)));

// Gunnel curves get added last, they need to be converted like the side curves
let gunnel_default: Point[] = [
    new Point(0.0, 0.0, hull_width, weights[3][0]),
    new Point(gunnel_jump * hull_length_half, 0.0, hull_width,  weights[3][1]),
    new Point(gunnel_jump * hull_length_half, gunnel_rise, hull_width,  weights[3][2]),
    new Point(horizontal_flat * hull_length_half, gunnel_rise, hull_width,  weights[3][3]),
    meeting_point,
];
lee_curves.push(gunnel_default.map((p) => p.mul_dimm(asymmetry_lee, 2)));
wind_curves.push(gunnel_default.map((p) => p.mul_dimm(asymmetry_wind, 2)));

let export_svg = (name: string, model: IModel) => {
    let to_export = MakerJs.model.scale(MakerJs.model.clone(model), scale_up);
    var svg = exporter.toSVG(to_export);
    fs.writeFile(name + ".svg", svg, (_) => {});
};

let hull = new RationalBezierHull(
    wind_curves,
    lee_curves,
    slices,
    meeting_point.x,
    variance_threshold,
);

let proj_maps: IModelMap[] = [{}, {}, {}];
let projections: IModel[] = [
    { models: proj_maps[0] },
    { models: proj_maps[1] },
    { models: proj_maps[2] },
];

let model_map: IModelMap = {
    x: projections[0],
    y: projections[1],
    z: projections[2],
};

let model: IModel = {
    models: model_map,
};

for (let i = 0; i < 3; i++) {
    proj_maps[i]["main_curves"] = hull.draw_main_curves(i);
    proj_maps[i]["hull_segments"] = hull.draw_segments(
        i,
        segments_drawn,
        draw_lee,
        draw_wind,
        as_divisions
    );
    // proj_maps[i]["hull_curves"] = hull.draw_hull_curves(
    //     i,
    //     draw_lee,
    //     draw_wind
    // );
}

for (let i = 0; i < 3; i++) {
    if (i == 1) {
      continue;
    }
    let paths: IPathMap = {};
    waterlines.forEach((wl, idx) => {
        let a: Point = new Point(hull_length_half, hull_depth + wl, hull_width, 0);
        let b: Point = new Point(0, hull_depth + wl, -hull_width, 0);
        paths["wl_" + i + "_" + idx] = {
            layer: "aqua",
            ...new MakerJs.paths.Line(a.to_ipoint(i), b.to_ipoint(i)),
        };
    });
    projections[i].paths = paths;
}

projections[0] = MakerJs.model.move(projections[0], [-hull_width, 0]);
projections[1] = MakerJs.model.move(projections[1], [0, hull_width]);

// let { lee, wind, lee_panels, wind_panels } =
//     hull.draw_flattened_hull(
//         draw_lee,
//         draw_wind,
//         puzzle_tooth_width,
//         puzzle_tooth_angle,
//         bulk_heads
//     );

// let x_offset = hull_length / 7;

// if (draw_lee) {
//     let name = "lee_flat";
//     export_svg(name, lee);
//     lee = MakerJs.model.rotate(lee, -90);
//     lee = MakerJs.model.mirror(lee, true, true);
//     lee = MakerJs.model.move(lee, [
//         x_offset + gunnel_rise * 1.05,
//         -hull_depth * 1.1,
//     ]);
//     model_map[name] = lee;

//     lee_panels.forEach((panel, idx) => {
//         export_svg("lee_panel_" + idx, panel);
//     });
// }
// if (draw_wind) {
//     let name = "wind_flat";
//     export_svg(name, wind);
//     wind = MakerJs.model.rotate(wind, -90);
//     wind = MakerJs.model.mirror(wind, false, true);
//     wind = MakerJs.model.move(wind, [
//         x_offset - gunnel_rise * 1.05,
//         -hull_depth * 1.1,
//     ]);
//     model_map[name] = wind;

//     wind_panels.forEach((panel, idx) => {
//         export_svg("wind_panel_" + idx, panel);
//     });
// }

bulk_heads.forEach((dist, idx) => {
    let bulk_head = hull.draw_bulkhead(dist, idx);
    bulk_head = MakerJs.model.rotate(bulk_head, 90);
    let name = "bulk_head_" + idx;
    export_svg(name, bulk_head);
    bulk_head.caption = undefined;
    bulk_head = MakerJs.model.move(bulk_head, [
        idx * hull_width * 1.1,
        hull_width * 2 - hull_depth,
    ]);
    model_map[name] = bulk_head;
});

export_svg("hull_model", model);

// let water_line_volumes_ratio: number[] = [];
// waterlines.forEach((w) => {
//     let volume = hull.volume_under(w + hull_depth) * 0.02831685;
//     water_line_volumes_ratio.push(volume);
//     console.log("\n==== WATERLINE " + w.toPrecision(5) + " ====");
//     console.log("Volume: " + volume.toPrecision(5) + " m3");
//     console.log("Displacement: " + (volume * 1024).toPrecision(5) + " kg");
// });

// if (water_line_volumes_ratio.length > 1) {
//     console.log("\n==== WATERLINE VOLUME RATIOS ====");
//     for (let i = 1; i < water_line_volumes_ratio.length; i++) {
//         console.log(
//             water_line_volumes_ratio[i] / water_line_volumes_ratio[i - 1]
//         );
//     }
// }
