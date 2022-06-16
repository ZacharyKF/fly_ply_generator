import * as fs from "fs";
import MakerJs, { IModel, IPath, models, exporter, IPathMap } from "makerjs";
import { abs, floor, pi } from "mathjs";
import { Point, Point2D } from "../euclidean/rational_point";

export function export_svg(name: string, model: IModel) {
    const to_export = MakerJs.model.scale(MakerJs.model.clone(model), 100);
    const svg = exporter.toSVG(to_export);
    fs.writeFile("svg/" + name + ".svg", svg, (_) => {});
}

export function colinear_filter_points(
    datum: Point[],
    tolerance: number
): Point[] {
    if (datum.length <= 2) {
        return datum;
    }
    let changed = false;
    do {
        changed = false;
        let idx_place = 1;
        let match = 0;

        for (let i = 1; i < datum.length - 1; i++) {
            if (match > 0) {
                datum[idx_place] = datum[i];
                idx_place++;
                match--;
                continue;
            }
            const vec_a = datum[i + 1].sub(datum[i]);
            const vec_b = datum[i].sub(datum[i - 1]);
            const dot = vec_a.dot(vec_b);

            if (abs(dot) >= tolerance) {
                changed = true;
            } else {
                datum[idx_place] = datum[i];
                idx_place++;
                match = 2;
            }
        }

        datum[idx_place] = datum[datum.length - 1];
        datum.length = idx_place + 1;
    } while (changed);
    return datum;
}

export function points_to_imodel(
    dimension: number,
    loop: boolean,
    points: Point[]
): IModel {
    return new models.ConnectTheDots(
        loop,
        colinear_filter_points(points, 0.99999999).map((p) =>
            p.to_ipoint(dimension)
        )
    );
}

export const colours: string[] = [
    "aqua",
    // "blue", RESERVED
    "fuchsia",
    // "green",
    // "gray",
    "lime",
    // "maroon",
    // "navy",
    // "olive",
    "orange",
    // "purple",
    // "red", RESERVED
    // "silver",
    "teal",
    // "white",
    "yellow",
    // "black",
];

export function color_naturally<T extends IModel | IPath>(
    val: T,
    index: number
): T {
    val.layer = colours[index % colours.length];
    return val;
}

export const dark_colours: string[] = [
    "maroon",
    "navy",
    "olive",
    "purple",
    "black",
];

export function color_dark<T extends IModel | IPath>(val: T, index: number): T {
    val.layer = dark_colours[index % dark_colours.length];
    return val;
}

export class DistanceEnhancedPath {
    distances: number[];

    constructor(readonly path: Point2D[]) {
        this.distances = new Array(path.length);
        this.distances[0] = 0;
        for (let i = 1; i < path.length; i++) {
            this.distances[i] =
                this.distances[i - 1] + path[i].dist(path[i - 1]);
        }
    }

    d_length() {
        return this.distances[this.distances.length - 1];
    }

    length() {
        return this.distances.length;
    }

    points_before(dist: number): Point2D[] {
        if (dist >= this.d_length()) {
            return this.path;
        }

        let i = 0;
        let result: Point2D[] = [];
        while (this.distances[i + 1] < dist) {
            result.push(this.path[i]);
            i++;
        }
        return result;
    }

    points_after(dist: number): Point2D[] {
        if (dist > this.d_length()) {
            return [];
        } else if (dist <= 0) {
            return this.path;
        }

        let i = 0;
        while (this.distances[i + 1] < dist) {
            i++;
        }

        let result: Point2D[] = [];
        for (let j = i + 1; j < this.distances.length; j++) {
            result.push(this.path[j]);
        }
        return result;
    }

    point_at(dist: number): Point2D {
        if (dist <= 0) {
            return this.path[0];
        } else if (dist >= this.d_length()) {
            return this.path[this.path.length - 1];
        }

        let i = 0;
        while (this.distances[i + 1] < dist) {
            // If we're lucky we'll hit on an exact match
            if (this.distances[i] == dist) {
                return this.path[i];
            }

            i++;
        }

        // Otherwise we need to interpolate
        let remaining_dist = dist - this.distances[i];
        let origin = this.path[i];
        let vec = this.path[i].sub(this.path[i + 1]).as_unit();
        return origin.add(vec.mul(remaining_dist));
    }
}

export function point_path_to_puzzle_teeth(
    path: Point2D[],
    puzzle_tooth_width: number,
    puzzle_tooth_angle: number
): Point2D[] {
    let enhanced_path = new DistanceEnhancedPath(path);

    // Calculations for the positions of the tooth starts/ends
    let n_teeth = floor(enhanced_path.d_length() / puzzle_tooth_width) - 2;
    if (n_teeth > 6) {
        n_teeth = n_teeth - 2;
    }
    let buffer_dist =
        (enhanced_path.d_length() - n_teeth * puzzle_tooth_width) / 2;
    let dist_refactor: number[] = [buffer_dist];
    for (let i = 0; i < n_teeth; i++) {
        dist_refactor.push(puzzle_tooth_width + dist_refactor[i]);
    }

    // If there's no space for teeth there's no point in trying to draw them
    if (dist_refactor.length < 2) {
        return path;
    }

    let result: Point2D[] = [];

    // The points at the start of the line, before the tooth buffer
    result.push(...enhanced_path.points_before(dist_refactor[0]));

    // This is where we make the teeth
    let prev_point = enhanced_path.point_at(dist_refactor[0]);
    for (let i = 1; i < dist_refactor.length; i++) {
        let curr_point = enhanced_path.point_at(dist_refactor[i]);

        // Build a tooth!
        let outside = i % 2 == 0;
        let angle = outside ? pi / 2 : -pi / 2;
        angle += prev_point.axis_angle(0, curr_point);

        let a = prev_point.flat_rotation(
            2,
            puzzle_tooth_width / 2,
            angle + (outside ? puzzle_tooth_angle : -puzzle_tooth_angle)
        );

        let b = curr_point.flat_rotation(
            2,
            puzzle_tooth_width / 2,
            angle + (outside ? -puzzle_tooth_angle : puzzle_tooth_angle)
        );

        result.push(prev_point);
        result.push(a);
        result.push(b);
        result.push(curr_point);

        prev_point = curr_point;
    }

    // The points at the end of the line, after the last tooth
    result.push(
        ...enhanced_path.points_after(dist_refactor[dist_refactor.length - 1])
    );

    return result;
}

export function make_arrow<P extends Point>(
    dimm: number,
    s: P,
    e: P,
    a: number,
    l: number
): IModel {
    const end = s.to_ipoint(dimm);
    const origin = e.to_ipoint(dimm);
    const a_se = e.axis_angle(dimm, s);
    const ha = e.flat_rotation(0, l, a_se + a);
    const hb = e.flat_rotation(0, l, a_se - a);

    return {
        paths: {
            a: { type: "line", origin, end },
            b: { type: "line", origin, end: ha.to_ipoint(dimm) },
            c: { type: "line", origin, end: hb.to_ipoint(dimm) },
        },
    };
}
