import { Point } from "bezier-js";
import * as fs from "fs";
import MakerJs, { IModel, IModelMap, exporter } from "makerjs";
import { pi, tan } from "mathjs";
import { BoxedPathHull } from "./boxed_path_hull";

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
    wind: boolean
  ): IModel;
  draw_flattened_hull(
    lee: boolean,
    wind: boolean,
    puzzle_tooth_width: number,
    puzzle_tooth_angle: number,
    bulkheads: number[]
  ): FlattenResult;
  draw_bulkhead(dist: number, idx: number): IModel;
}

// Measurements for Aka, all in feet, degrees, or unitless
let scale_up = 100;
let hull_length = 15.5;
let arc_threshold = 0.0075;
let hull_length_half = hull_length / 2.0;
let hull_ratio = 1.0 / 10.0;
let hull_width = hull_length * hull_ratio;
let bow_rake = 10;
let rake_rad = (bow_rake * pi) / 180.0;
let asymmetry_wind = 4.0 / 7.0;
let asymmetry_lee = asymmetry_wind - 1.0;
let horizontal_flat = 2.0 / 3.0;
let hull_depth = 2.25;
let gunnel_rise = hull_depth / 4.0;
let slices = 750;
let segments_drawn = 10;
let curve_colinearity_tolerance = 0.95;
let puzzle_tooth_width = hull_depth / 30;
let puzzle_tooth_angle = (10 * pi) / 180;
let draw_lee = true;
let draw_wind = true;
let bulk_heads: number[] = [
  0.0,
  hull_length_half / 3,
  (2 * hull_length_half) / 3,
];

let control_points: Point[] = [
  { x: 0.0, y: 1.1 },
  { x: 8.0, y: 1.0 },
  { x: 10.0, y: 0.0 },
];

let tumblehome: Point[] = [
  { x: 0, y: 15.0 },
  { x: 7, y: 5.0 },
  { x: 10, y: 0.0 },
];

let meeting_point: Point = {
  x: hull_length_half + gunnel_rise * tan(rake_rad),
  y: gunnel_rise,
  z: 0.0,
};

let gunnel_points_lee: Point[] = [
  {
    x: 0.0,
    y: 0.0,
    z: asymmetry_lee * hull_width,
  },
  {
    x: horizontal_flat * hull_length_half,
    y: 0.0,
    z: asymmetry_lee * hull_width,
  },
  {
    x: horizontal_flat * hull_length_half,
    y: gunnel_rise,
    z: asymmetry_lee * hull_width,
  },
  meeting_point,
];

let gunnel_points_wind: Point[] = [
  {
    x: 0.0,
    y: 0.0,
    z: asymmetry_wind * hull_width,
  },
  {
    x: horizontal_flat * hull_length_half,
    y: 0.0,
    z: asymmetry_wind * hull_width,
  },
  {
    x: horizontal_flat * hull_length_half,
    y: gunnel_rise,
    z: asymmetry_wind * hull_width,
  },
  meeting_point,
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
    x: hull_length_half - hull_depth * tan((bow_rake * pi) / 180.0),
    y: -hull_depth,
    z: 0.0,
  },
  meeting_point,
];

let export_svg = (name: string, model: IModel) => {
  let to_export = MakerJs.model.scale(MakerJs.model.clone(model), scale_up);
  var svg = exporter.toSVG(to_export);
  fs.writeFile(name + ".svg", svg, (_) => {});
};

let boxed_path_hull = new BoxedPathHull(
  gunnel_points_lee,
  gunnel_points_wind,
  bilge_points,
  control_points,
  hull_length_half,
  tumblehome,
  slices,
  arc_threshold,
  curve_colinearity_tolerance
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
  proj_maps[i]["main_curves"] = boxed_path_hull.draw_main_curves(i);
  proj_maps[i]["hull_segments"] = boxed_path_hull.draw_segments(
    i,
    segments_drawn,
    draw_lee,
    draw_wind
  );
  proj_maps[i]["hull_curves"] = boxed_path_hull.draw_hull_curves(
    i,
    draw_lee,
    draw_wind
  );
}

projections[0] = MakerJs.model.move(projections[0], [-hull_width, 0]);
projections[1] = MakerJs.model.move(projections[1], [0, gunnel_rise * 2]);

let { lee, wind, lee_panels, wind_panels } =
  boxed_path_hull.draw_flattened_hull(
    draw_lee,
    draw_wind,
    puzzle_tooth_width,
    puzzle_tooth_angle,
    bulk_heads
  );

let x_offset = hull_length / 7;

if (draw_lee) {
  let name = "lee_flat";
  export_svg(name, lee);
  lee = MakerJs.model.rotate(lee, -90);
  lee = MakerJs.model.mirror(lee, true, true);
  lee = MakerJs.model.move(lee, [
    x_offset + gunnel_rise * 1.05,
    -hull_depth * 1.1,
  ]);
  model_map[name] = lee;

  lee_panels.forEach((panel, idx) => {
    export_svg("lee_panel_" + idx, panel);
  });
}
if (draw_wind) {
  let name = "wind_flat";
  export_svg(name, wind);
  wind = MakerJs.model.rotate(wind, -90);
  wind = MakerJs.model.mirror(wind, false, true);
  wind = MakerJs.model.move(wind, [
    x_offset - gunnel_rise * 1.05,
    -hull_depth * 1.1,
  ]);
  model_map[name] = wind;

  wind_panels.forEach((panel, idx) => {
    export_svg("wind_panel_" + idx, panel);
  });
}

bulk_heads.forEach((dist, idx) => {
  let bulk_head = boxed_path_hull.draw_bulkhead(dist, idx);
  let name = "bulk_head_" + idx;
  export_svg(name, bulk_head);
  bulk_head.caption = undefined;
  bulk_head = MakerJs.model.move(bulk_head, [
    idx * hull_width * 1.1,
    hull_depth * 2,
  ]);
  model_map[name] = bulk_head;
});

export_svg("hull_model", model);
