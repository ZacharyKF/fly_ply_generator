import MakerJs, { IModel, IModelMap, IPathMap, models } from "makerjs";
import BezierJs, { Projection, Bezier, Point, utils, Closest } from "bezier-js";
import { bezierjs_arc_to_makerjs_arc, bezier_to_beziercurve, color_naturally, flatten_bezierjs, point_to_ipoint } from "./makerjs_tools";
import * as fs from "fs";
import { tan, pi, min, max } from "mathjs";
import { BoxedPathHull, build_boxed_hull, draw_main_curves, split_curve_to_chines, split_curve_to_natural_arcs, draw_hull_curves, draw_flattened_hull, draw_segments } from "./boxed_path_hull";

// Measurements for Aka, all in feet, degrees, or unitless
let hull_length = 15.5;
let merge_threshold = 0.0125;
let hull_length_half = hull_length / 2.0;
let hull_ratio = 1.0 / 9.0;
let hull_width = hull_length * hull_ratio;
let bow_rake = 15;
let rake_rad = bow_rake * pi / 180.0;
let asymmetry_wind = 4.0 / 7.0;
let asymmetry_lee = asymmetry_wind - 1.0;
let horizontal_flat = 3.0 / 5.0;
let hull_depth = 2.5;
let gunnel_rise = hull_depth / 5.0;
let slices = 500;
let segments_drawn = 50;
let draw_lee = true;
let draw_wind = true;

let control_points: Point[] = [
    { x: 10.0, y: 1.0 },
    { x: 5, y: 1.0 },
    { x: 0.0, y: 0.0 },
];

let tumblehome: Point[] = [
    { x: 0, y: 15.0 },
    { x: 7, y: 15.0 },
    { x: 10, y: 0.0 },
];

let meeting_point: Point = {
    x: hull_length_half + (gunnel_rise * tan(rake_rad)),
    y: gunnel_rise,
    z: 0.0,
};

let gunnel_points_lee: Point[] = [
    {
        x: 0.0,
        y: 0.0,
        z: asymmetry_lee * hull_width
    },
    {
        x: horizontal_flat * hull_length_half,
        y: 0.0,
        z: asymmetry_lee * hull_width
    },
    {
        x: horizontal_flat * hull_length_half,
        y: gunnel_rise,
        z: asymmetry_lee * hull_width
    },
    meeting_point
];

let gunnel_points_wind: Point[] = [
    {
        x: 0.0,
        y: 0.0,
        z: asymmetry_wind * hull_width
    },
    {
        x: horizontal_flat * hull_length_half,
        y: 0.0,
        z: asymmetry_wind * hull_width
    },
    {
        x: horizontal_flat * hull_length_half,
        y: gunnel_rise,
        z: asymmetry_wind * hull_width
    },
    meeting_point
];

let bilge_points: Point[] = [
    {
        x: 0.0,
        y: -hull_depth,
        z: 0.0,
    },
    {
        x: hull_length_half * horizontal_flat,
        y: -hull_depth,
        z: 0.0,
    },
    {
        x: hull_length_half - (hull_depth * tan(bow_rake * pi / 180.0)),
        y: -hull_depth,
        z: 0.0,
    },
    meeting_point
];

let boxed_path_hull: BoxedPathHull = build_boxed_hull(
    gunnel_points_lee,
    gunnel_points_wind,
    bilge_points,
    control_points,
    hull_length_half,
    tumblehome,
    slices,
    merge_threshold,
);

let proj_maps: IModelMap[] = [
    {},
    {},
    {}
]
let projections: IModel[] = [
    { models: proj_maps[0] },
    { models: proj_maps[1] },
    { models: proj_maps[2] }
];
let model_map: IModelMap = {
    "x": projections[0],
    "y": projections[1],
    "z": projections[2],
};

let model: IModel = {
    models: model_map
};

for (let i = 0; i < 3; i++) {
    proj_maps[i]["main_curves"] = draw_main_curves(boxed_path_hull, i);
    let {lee, wind} = draw_hull_curves(boxed_path_hull,i);
    let {lee_segments, wind_segments} = draw_segments(boxed_path_hull, i, segments_drawn);
    if (draw_lee) {
        proj_maps[i]["hull_curves_lee"] = lee;
        proj_maps[i]["hull_segments_lee"] = lee_segments;
    }
    if (draw_wind) {
        proj_maps[i]["hull_curves_wind"] = wind;
        proj_maps[i]["hull_segments_wind"] = wind_segments;
    }
}

projections[0] = MakerJs.model.move(MakerJs.model.rotate(projections[0], 90), [-hull_width, 0]);
projections[1] = MakerJs.model.move(projections[1], [0, gunnel_rise * 2]);

let {lee, wind} = draw_flattened_hull(boxed_path_hull);
let x_offset = hull_length/7;
if (draw_lee) {
    lee = MakerJs.model.rotate(lee, -90);
    lee = MakerJs.model.mirror(lee, true, true);
    lee = MakerJs.model.move(lee, [x_offset + gunnel_rise * 1.05, -hull_depth * 1.1])
    model_map["lee_flat"] = lee;
}
if (draw_wind) {
    wind = MakerJs.model.rotate(wind, -90);
    wind = MakerJs.model.mirror(wind, false, true);
    wind = MakerJs.model.move(wind, [x_offset - gunnel_rise * 1.05, -hull_depth * 1.1])
    model_map["wind_flat"] = wind;
}

var renderOptions: MakerJs.exporter.ISVGRenderOptions = {
    strokeWidth: "1.5px",
    units: MakerJs.unitType.Foot,
    scale: 1 / 12,
};

var svg = MakerJs.exporter.toSVG(model, renderOptions);

fs.writeFile("boxed_hull_controls.svg", svg, _ => { });
