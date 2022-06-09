import * as fs from "fs";
import MakerJs, { IModel, IModelMap, exporter, IPathMap } from "makerjs";
import { abs, min, pi, tan } from "mathjs";
import { BezierSurfaceHull } from "./hulls/bezier_surface_hull";
import { get_debug_proa } from "./hulls/debug_proa";
import { get_fogo_island_gunning_punt } from "./hulls/fogo_gunning_punt";
import { RationalBounds } from "./euclidean/rational_bounds";
import { RationalPlane } from "./euclidean/rational_plane";
import { Point2D, Point3D } from "./euclidean/rational_point";

// The hull
const { transom, bulk_heads, waterlines, wind, lee , panels} =
    get_fogo_island_gunning_punt(); //get_debug_proa(); //;

// Drawing parameters
let scale_up = 100;
let slices = 250;
let draw_main_curves = true;
let draw_segments = true;
let draw_hull_curves = true;
let draw_hull_curve_bezier = true;
let draw_flattened = true;
let draw_transom = true;
let draw_waterlines = true;
let draw_bulkheads = true;
let lee_draw = true;
let wind_draw = true;
let as_divisions = true;
let straight_lowers = false;

// Hull division parameters
let puzzle_tooth_width = 2.5 / 30;
let puzzle_tooth_angle = (10 * pi) / 180;

// ACTUAL CODE
let segments_drawn = min(slices - 1, 75);
let export_svg = (name: string, model: IModel) => {
    let to_export = MakerJs.model.scale(MakerJs.model.clone(model), scale_up);
    var svg = exporter.toSVG(to_export);
    fs.writeFile("../svg/" + name + ".svg", svg, (_) => {});
};

const bounds = new RationalBounds(Point3D.Zero);
const consume_line = (line: Point3D[]) => {
    line.forEach((p) => bounds.consume(p));
};
wind.forEach(consume_line);
lee.forEach(consume_line);
const hull_width = abs(bounds.max.z - bounds.min.z);
const hull_length = abs(bounds.max.x - bounds.min.x);
const hull_depth = abs(bounds.max.y - bounds.min.y);

const grid_x = 1.05 * hull_length;
const grid_y = 1.05 * hull_depth;
const grid_z = 1.05 * hull_width;

let hull = new BezierSurfaceHull(
    wind,
    lee,
    panels,
    bulk_heads
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

if (draw_waterlines && waterlines.length > 0) {
    for (let i = 0; i < 3; i++) {
        if (i == 1) {
            continue;
        }
        let paths: IPathMap = {};
        waterlines.forEach((wl, idx) => {
            let a: Point3D = new Point3D(grid_x, wl, bounds.max.z * 1.05, 0);

            let b: Point3D = new Point3D(
                hull_length - grid_x,
                wl,
                bounds.max.z * -1.05,
                0
            );
            paths["wl_" + i + "_" + idx] = {
                layer: "aqua",
                ...new MakerJs.paths.Line(a.to_ipoint(i), b.to_ipoint(i)),
            };
        });
        projections[i].paths = paths;
    }

    console.log("\n==== WATERLINES ====");
    let water_line_volumes_ratio: number[] = [];
    waterlines.forEach((w) => {
        let volume = hull.volume_under(w) * 0.02831685;
        water_line_volumes_ratio.push(volume);
        console.log("Waterline    : " + w.toPrecision(4));
        console.log("    => Volume    : " + volume.toPrecision(4) + " m3");
        console.log(
            "    => Displc.   : " + (volume * 1024).toPrecision(5) + " kg"
        );
    });

    if (water_line_volumes_ratio.length > 1) {
        console.log("\n==== WATERLINE VOLUME RATIOS ====");
        for (let i = 1; i < water_line_volumes_ratio.length; i++) {
            console.log(
                (
                    water_line_volumes_ratio[i] /
                    water_line_volumes_ratio[i - 1]
                ).toPrecision(4)
            );
        }
    }
}

for (let i = 0; i < 3; i++) {
    if (draw_segments) {
        proj_maps[i][0] = hull.draw_segments(
            i,
            segments_drawn,
            lee_draw,
            wind_draw,
            as_divisions
        );
    }
    if (draw_hull_curves) {
        proj_maps[i][1] = hull.draw_hull_curves(
            draw_hull_curve_bezier,
            i,
            lee_draw,
            wind_draw
        );
    }
    if (draw_main_curves) {
        proj_maps[i][2] = hull.draw_main_curves(i);
    }
}

let y = -hull_depth;
projections[0] = MakerJs.model.move(MakerJs.model.rotate(projections[0], 90), [
    grid_z / 2,
    y,
]);
y += -grid_z / 2;
projections[1] = MakerJs.model.move(projections[1], [0, y]);
y += -grid_y - grid_z / 2;
projections[2] = MakerJs.model.move(projections[2], [0, y]);

if (draw_flattened) {
    let { lee, wind, lee_panels, wind_panels, bounds_lee, bounds_wind } = hull.draw_flattened_hull(
        lee_draw,
        wind_draw,
        puzzle_tooth_width,
        puzzle_tooth_angle,
        straight_lowers,
    );

    y += hull_depth - grid_y;

    if (lee_draw) {
        let name = "lee_flat";
        export_svg(name, lee);
        let x = bounds_lee.max.x - bounds_lee.min.x;
        lee = MakerJs.model.move(lee, [x, y]);
        model_map[name] = lee;

        lee_panels.forEach((panel, idx) => {
            export_svg("lee_panel_" + idx, panel);
        });
    }
    if (wind_draw) {
        let name = "wind_flat";
        export_svg(name, wind);
        wind = MakerJs.model.rotate(wind, 180);
        y += -(bounds_lee.max.y - bounds_lee.min.y) * 1.5;
        wind = MakerJs.model.move(wind, [0, y]);
        model_map[name] = wind;

        wind_panels.forEach((panel, idx) => {
            export_svg("wind_panel_" + idx, panel);
        });
    }
}

if (draw_transom && transom) {
    let transom = hull.draw_transom();
    export_svg("transom", transom);
    transom = MakerJs.model.move(transom, [grid_z, 0]);
    model_map["transom"] = transom;
}

if (draw_bulkheads && bulk_heads.length > 0) {
    let y = 0;
    let x = grid_z;
    if (draw_transom && transom) {
        x += grid_z;
    }
    bulk_heads.forEach((_, idx) => {
        let bulk_head = hull.draw_bulkhead(idx);
        let name = "bulk_head_" + idx;
        export_svg(name, bulk_head);
        bulk_head.caption = undefined;
        bulk_head = MakerJs.model.move(bulk_head, [x, y]);
        x += grid_z;
        model_map[name] = bulk_head;
    });
}

export_svg("hull_model", model);

export interface FlattenResult {
    lee: IModel;
    wind: IModel;
    lee_panels: IModel[];
    wind_panels: IModel[];
    bounds_lee: RationalBounds<Point2D>;
    bounds_wind: RationalBounds<Point2D>;
}

export interface HullShape {
    transom: boolean;
    bulk_heads: RationalPlane[];
    waterlines: number[];
    lee: Point3D[][];
    wind: Point3D[][];
    panels: PanelSplits[];
}

export interface DrawableHull {
    draw_main_curves(dimm: number): IModel;
    draw_segments(
        dimm: number,
        number_segs: number,
        lee: boolean,
        wind: boolean,
        as_divisions: boolean
    ): IModel;
    draw_flattened_hull(
        lee: boolean,
        wind: boolean,
        puzzle_tooth_width: number,
        puzzle_tooth_angle: number,
        straight_lowers: boolean,
    ): FlattenResult;
    draw_hull_curves(
        draw_hull_curve_bezier: boolean,
        dimension: number,
        lee: boolean,
        wind: boolean
    ): IModel;
    draw_transom(): IModel;
    draw_bulkhead(idx: number): IModel;
    volume_under(dist: number): number;
}

export interface PanelSplits {
    t: number;
    n: number;
}