/**
 * This is a simple test to create a hull and project it onto the XY plane by flattening the points
 */
import MakerJs, { IModel } from "makerjs";
import { BezierPathHull, buildBezierPathHull, get_hull_curves_at_dist, get_panel_curves_at_dist } from "./bezier_path_hull";
import { flatten_bezier, flatten_line } from "./makerjs_tools";
import * as fs from "fs";

// Measurements for Aka, all in feet, degrees, or unitless
let hull_length = 15.5;
let hull_length_half = hull_length/2.0;
let hull_ratio = 1.0/10.0;
let hull_width = hull_length * hull_ratio;
let bow_rake = 5;
let asymmetry = 3.0/5.0;
let horizontal_flat = 4.0/5.0;
let hull_depth = 3.0;
let gunnel_rise = hull_depth/8.0;
let main_curve_depth = hull_depth * 3.0/5.0;
let lower_curve_depth = hull_depth * 6.0/5.0;

let hull: BezierPathHull = buildBezierPathHull(
    hull_width,
    hull_length_half,
    bow_rake,
    asymmetry,
    horizontal_flat,
    gunnel_rise,
    main_curve_depth,
    lower_curve_depth,
    hull_depth,
);

let proj_dim = 0;

let lee_gunnel = flatten_bezier(hull.lee_gunnel_bezier, proj_dim);
let wind_gunnel = flatten_bezier(hull.wind_gunnel_bezier, proj_dim);
let new_main_curve = flatten_bezier(hull.upper_bezier, proj_dim);
let new_lower_curve = flatten_bezier(hull.lower_bezier, proj_dim);

let model: IModel = {
    models: {
        lee_gunnel,
        wind_gunnel,
        new_main_curve,
        new_lower_curve,
    }
}

let num_ribs = 20;
let width_step = hull.max_length/num_ribs;
if (model.models != undefined) {
    for (let i = 0; i < num_ribs; i++) {
        let side_beziers = get_hull_curves_at_dist(hull, i * width_step);
        let display_curve_a = flatten_line(side_beziers[0], proj_dim);
        let display_curve_b = flatten_line(side_beziers[1], proj_dim);
        model.models["rib_a_" + i] = display_curve_a;
        model.models["rib_b_" + i] = display_curve_b;
    }
}

var renderOptions: MakerJs.exporter.ISVGRenderOptions = {
    strokeWidth: "1.5px",
    units: MakerJs.unitType.Foot,
    scale: 1/12,
};

var svg = MakerJs.exporter.toSVG(model, renderOptions);

fs.writeFile("test.svg", svg, _ => { });
