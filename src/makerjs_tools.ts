import { IModel, IPath, IPathArc, IPoint, models, paths } from "makerjs";
import { abs, floor, pi, pow, sqrt } from "mathjs";
import { Point, Point2D, Point3D } from "./rational_point";

export function colinear_filter<T>(
    datum: T[],
    get_point: (data: T) => Point,
    minimum: number,
    tolerance: number
): T[] {
    if (datum.length <= minimum) {
        return datum;
    }

    let points: Point[] = datum.map(get_point);

    let to_remove: number[] = [];
    do {
        if (points.length - to_remove.length <= minimum) {
            break;
        }

        to_remove.reverse().forEach((idx) => {
            points.splice(idx, 1);
            datum.splice(idx, 1);
        });
        to_remove = [];

        for (let i = 1; i < points.length - 1; i++) {
            let vec_a = points[i + 1].sub(points[i]);
            let vec_b = points[i - 1].sub(points[i]);
            let dot = abs(vec_a.dot(vec_b));
            if (dot < tolerance) {
                to_remove.push(i);

                // skip one to avoid redundant deletion
                i++;
            }
        }
    } while (to_remove.length > 0);

    return datum;
}

export function colinear_filter_points(
    datum: Point[],
    minimum: number,
    tolerance: number
): Point[] {
    if (datum.length <= minimum) {
        return datum;
    }

    let to_remove: number[] = [];
    do {
        if (datum.length - to_remove.length <= minimum) {
            break;
        }

        to_remove.reverse().forEach((idx) => {
            datum.splice(idx, 1);
        });
        to_remove = [];

        for (let i = 1; i < datum.length - 1; i++) {
            let vec_a = datum[i + 1].sub(datum[i]);
            let vec_b = datum[i].sub(datum[i - 1]);
            let dot = vec_a.dot(vec_b);
            if (dot > tolerance) {
                to_remove.push(i);

                // skip two to avoid redundant deletion
                i = i + 2;
            }
        }
    } while (to_remove.length > 0);

    return datum;
}

export function points_to_imodel(
    dimension: number,
    loop: boolean,
    points: Point[]
): IModel {
    return new models.ConnectTheDots(loop, points.map(p => p.to_ipoint(dimension)));
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
    path: Point2D[];
    distances: number[];

    constructor(path: Point2D[]) {
        this.path = path;
        this.distances = [0];
        for (let i = 1; i < path.length; i++) {
            this.distances.push(
                this.distances[i - 1] + path[i].dist(path[i - 1])
            );
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
            angle + (outside ? puzzle_tooth_angle : -puzzle_tooth_angle),
        );

        let b = curr_point.flat_rotation(
            2,
            puzzle_tooth_width / 2,
            angle + (outside ? -puzzle_tooth_angle : puzzle_tooth_angle),
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
